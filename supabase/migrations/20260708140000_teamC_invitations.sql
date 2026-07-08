-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 4 : invitations par LIEN (100% SQL, sans service_role).
--
-- Flux :
--   1. create_invitation(email, name, role) : un admin/owner de la société
--      crée une invitation ; la fonction génère un JETON et renvoie le tout.
--      Le frontend construit un lien #accepter-invitation?token=... à partager.
--   2. accept_invitation(token) : la personne connectée (dont l'email DOIT
--      correspondre à l'invitation) est rattachée à organization_members avec
--      le rôle prévu ; l'invitation passe à 'accepted'.
--
-- SÉCURITÉ :
--   - les deux fonctions sont SECURITY DEFINER + search_path=public verrouillé ;
--   - create_invitation force organization_id = société de l'appelant et EXIGE
--     qu'il en soit admin/owner/manager (pas d'injection inter-société) ;
--   - accept_invitation exige un jeton valide, non expiré, non consommé, ET
--     que l'email du compte connecté = email invité (le lien seul ne suffit pas) ;
--   - la table est en RLS : écriture directe interdite (tout passe par les
--     fonctions), lecture réservée aux admins de la société ;
--   - le rôle invitable est validé dans la fonction (admin/manager/viewer) —
--     on n'invite jamais un 'owner'.
-- Idempotente.
-- =====================================================================

-- ---------- 1. Table user_invitations (canonicalisée, idempotente) ----------
create table if not exists public.user_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  email           text not null,
  name            text,
  role            text not null default 'viewer'
                    check (role in ('admin', 'manager', 'viewer')),
  token           text,
  invited_by      uuid references auth.users (id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at      timestamptz,
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Colonnes ajoutées si la table préexistait (ancien schéma pro-portal, sans org
-- ni jeton — et sans `name` dans certaines variantes). Tout est `if not exists`
-- + NULLABLE : sûr et rejouable, et « auto-répare » un ancien schéma pour que
-- create_invitation / getUserInvitations ne cassent pas (colonne manquante 42703).
alter table public.user_invitations
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.user_invitations add column if not exists token       text;
alter table public.user_invitations add column if not exists name        text;
alter table public.user_invitations add column if not exists role        text;
alter table public.user_invitations add column if not exists invited_by  uuid;
alter table public.user_invitations add column if not exists status      text;
alter table public.user_invitations add column if not exists expires_at  timestamptz;
alter table public.user_invitations add column if not exists accepted_at timestamptz;
alter table public.user_invitations add column if not exists accepted_by uuid;
alter table public.user_invitations add column if not exists created_at  timestamptz default now();
alter table public.user_invitations add column if not exists updated_at  timestamptz default now();

create unique index if not exists user_invitations_token_uidx
  on public.user_invitations (token) where token is not null;
create index if not exists user_invitations_org_idx
  on public.user_invitations (organization_id) where organization_id is not null;

alter table public.user_invitations enable row level security;

-- ---------- 2. RLS : on repart de ZÉRO (durcissement post-audit) ----------
-- Piège RLS : les policies PERMISSIVES se combinent en OR. Une base migrée
-- depuis l'ancien schéma pro-portal porte des policies héritées NON scopées par
-- société (« Les administrateurs peuvent voir/créer… » basées sur client_users
-- role='admin'), qui ÉLARGISSENT l'accès malgré nos nouvelles policies -> fuite
-- et injection inter-société. On supprime donc DYNAMIQUEMENT *toute* policy
-- existante (quel que soit son nom), puis on ne recrée que la LECTURE scopée.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_invitations'
  loop
    execute format('drop policy if exists %I on public.user_invitations', p.policyname);
  end loop;
end $$;

create policy user_invitations_select_admin on public.user_invitations
  for select using (public.user_in_org_admin(organization_id, auth.uid()));

-- Défense en profondeur : AUCUNE écriture directe par le client. Toute écriture
-- (créer / accepter / annuler) passe par les fonctions SECURITY DEFINER, qui
-- s'exécutent avec les droits du propriétaire et forcent le scope société.
-- Ainsi, même si une policy d'écriture héritée resurgissait, le GRANT manque.
revoke insert, update, delete on public.user_invitations from authenticated;
revoke insert, update, delete on public.user_invitations from anon;
revoke insert, update, delete on public.user_invitations from public;
grant select on public.user_invitations to authenticated;

-- ---------- 3. create_invitation : un admin crée une invitation pour SA société ----------
create or replace function public.create_invitation(
  p_email text,
  p_name  text,
  p_role  text
)
returns table (
  id              uuid,
  organization_id uuid,
  token           text,
  email           text,
  role            text,
  expires_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_token text;
  v_email text := lower(trim(p_email));
  v_role  text := lower(trim(p_role));
  v_id    uuid;
  v_exp   timestamptz := now() + interval '14 days';
begin
  if v_uid is null then
    raise exception 'Connexion requise pour inviter.' using errcode = '28000';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Email invité manquant.' using errcode = '22023';
  end if;
  if v_role not in ('admin', 'manager', 'viewer') then
    raise exception 'Rôle invalide (admin, manager ou viewer).' using errcode = '22023';
  end if;

  -- Société où l'appelant est admin/owner/manager (priorité owner > admin > manager).
  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_uid
    and m.role in ('owner', 'admin', 'manager')
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;

  if v_org is null then
    raise exception 'Vous devez être administrateur d''une société pour inviter.' using errcode = '42501';
  end if;

  -- Déjà membre ? (email déjà rattaché à cette société) -> rien à faire.
  if exists (
    select 1 from public.organization_members om
    join auth.users au on au.id = om.user_id
    where om.organization_id = v_org and lower(au.email) = v_email
  ) then
    raise exception 'Cette personne fait déjà partie de votre société.' using errcode = '23505';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  -- Réutiliser une invitation en attente pour le même couple (société, email),
  -- sinon en créer une. Rafraîchit le jeton et l'échéance.
  select ui.id into v_id
  from public.user_invitations ui
  where ui.organization_id = v_org and lower(ui.email) = v_email and ui.status = 'pending'
  limit 1;

  if v_id is null then
    insert into public.user_invitations
      (organization_id, email, name, role, token, invited_by, status, expires_at)
    values
      (v_org, v_email, p_name, v_role, v_token, v_uid, 'pending', v_exp)
    returning user_invitations.id into v_id;
  else
    update public.user_invitations ui
    set token = v_token, role = v_role, name = coalesce(p_name, ui.name),
        invited_by = v_uid, expires_at = v_exp, updated_at = now()
    where ui.id = v_id;
  end if;

  return query
    select ui.id, ui.organization_id, ui.token, ui.email, ui.role, ui.expires_at
    from public.user_invitations ui where ui.id = v_id;
end;
$$;

grant execute on function public.create_invitation(text, text, text) to authenticated;

-- ---------- 4. accept_invitation : la personne connectée rejoint la société ----------
create or replace function public.accept_invitation(p_token text)
returns table (organization_id uuid, organization_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_inv       public.user_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour accepter l''invitation.' using errcode = '28000';
  end if;

  select lower(au.email) into v_email from auth.users au where au.id = v_uid;

  select * into v_inv
  from public.user_invitations ui
  where ui.token = p_token
  limit 1;

  if v_inv.id is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Cette invitation a déjà été utilisée ou annulée.' using errcode = '22023';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update public.user_invitations set status = 'expired', updated_at = now() where id = v_inv.id;
    raise exception 'Cette invitation a expiré.' using errcode = '22023';
  end if;
  -- Le lien seul ne suffit pas : l'email connecté doit correspondre à l'invité.
  if v_email is null or lower(v_inv.email) <> v_email then
    raise exception 'Cette invitation ne correspond pas à l''email de votre compte.' using errcode = '42501';
  end if;

  -- Rattachement (idempotent : si déjà membre, on met à jour le rôle).
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.user_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid, updated_at = now()
  where id = v_inv.id;

  return query
    select o.id, o.name, v_inv.role
    from public.organizations o where o.id = v_inv.organization_id;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ---------- 5. cancel_invitation : annuler une invitation (admins de la société) ----------
-- L'UPDATE direct étant révoqué, l'annulation passe par cette fonction, qui
-- vérifie que l'appelant est bien admin de la société de l'invitation.
create or replace function public.cancel_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;

  select organization_id into v_org
  from public.user_invitations where id = p_invitation_id;

  if v_org is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
  if not public.user_in_org_admin(v_org, v_uid) then
    raise exception 'Vous ne pouvez pas annuler cette invitation.' using errcode = '42501';
  end if;

  update public.user_invitations
  set status = 'cancelled', updated_at = now()
  where id = p_invitation_id and status = 'pending';

  return true;
end;
$$;

grant execute on function public.cancel_invitation(uuid) to authenticated;
