-- =====================================================================
-- p26 — FONDATION DE LA CONSOLE D'ADMINISTRATION (bloquant B3)
--
-- MineGrid — l'exploitant de la plateforme — n'a aujourd'hui AUCUN compte
-- d'administration. Tout se fait à la main dans le tableau de bord Supabase,
-- avec la clé toute-puissante, sans identité, sans trace et sans révocation.
--
-- Cette migration pose la fondation, et rien d'autre : les écrans viendront
-- ensuite s'appuyer dessus. Elle ne donne aucun pouvoir nouveau à qui que ce
-- soit tant qu'un premier administrateur n'a pas été créé À LA MAIN (voir la
-- toute fin du fichier).
--
-- PRINCIPES, dans l'ordre d'importance
--   1. La liste des administrateurs est INVISIBLE aux comptes clients — pas
--      même en lecture : savoir qui est administrateur est déjà une information
--      sensible.
--   2. Une révocation prend effet IMMÉDIATEMENT : l'autorité est une fonction
--      interrogée à chaque appel, jamais un jeton ni un drapeau côté navigateur.
--   3. Le journal est INFALSIFIABLE : ni modification ni suppression, même par
--      le propriétaire de la base ou par la clé de service. Un verrou en base,
--      pas une convention.
--   4. PERSONNE ne peut se nommer soi-même, ni modifier son propre accès —
--      vérifié dans les fonctions ET verrouillé par un déclencheur, pour que le
--      jour où une fonction aura un défaut, la base refuse quand même.
--   5. Le dernier administrateur actif ne peut pas être retiré : sinon la
--      plateforme se verrouille toute seule, sans personne pour rouvrir.
--
-- Idempotente. Délimiteurs nommés (l'éditeur SQL de Supabase digère mal les $$).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Qui est administrateur de la plateforme
-- ---------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- 'owner' peut nommer et révoquer ; les autres rôles sont posés dès
  -- maintenant pour ne pas avoir à reprendre la table plus tard, mais la v1
  -- ne les distingue pas encore côté écrans.
  role         text not null default 'owner'
                 check (role in ('owner', 'support', 'finance', 'moderation')),
  granted_at   timestamptz not null default now(),
  granted_by   uuid references auth.users (id) on delete set null,
  -- Révocation = on garde la ligne (la trace de qui a eu l'accès, et quand),
  -- on la marque. Supprimer effacerait l'histoire.
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users (id) on delete set null,
  requires_mfa boolean not null default false,
  note         text
);

create index if not exists platform_admins_actifs_idx
  on public.platform_admins (user_id) where revoked_at is null;

alter table public.platform_admins enable row level security;

-- AUCUNE policy n'est créée : avec RLS active et zéro policy, la table est
-- fermée à tout le monde sauf au propriétaire et aux fonctions SECURITY
-- DEFINER. On retire en plus les privilèges, en défense en profondeur.
revoke all on table public.platform_admins from anon;
revoke all on table public.platform_admins from authenticated;

-- ---------------------------------------------------------------------
-- 2. L'autorité : une seule fonction, sans paramètre
-- ---------------------------------------------------------------------
-- Sans paramètre À DESSEIN : l'identité vient de la session, jamais du client.
-- Une fonction `is_platform_admin(p_user_id)` laisserait passer l'identité par
-- le navigateur, donc laisserait quelqu'un demander « et pour CET utilisateur ? ».

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $fn_is_admin$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.revoked_at is null
  );
$fn_is_admin$;

grant execute on function public.is_platform_admin() to authenticated;

-- Variante interne : le rôle de l'appelant, ou NULL s'il n'est pas administrateur.
create or replace function public.platform_admin_role()
returns text
language sql
security definer
stable
set search_path = public
as $fn_admin_role$
  select pa.role from public.platform_admins pa
  where pa.user_id = auth.uid() and pa.revoked_at is null;
$fn_admin_role$;

grant execute on function public.platform_admin_role() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Le journal, infalsifiable
-- ---------------------------------------------------------------------

create table if not exists public.platform_admin_audit (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users (id) on delete restrict,
  action      text not null,
  target_type text,
  target_id   text,
  -- Motif OBLIGATOIRE et non vide : un geste d'administration sans raison
  -- écrite est ingérable six mois plus tard.
  reason      text not null check (length(btrim(reason)) > 0),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists platform_admin_audit_date_idx
  on public.platform_admin_audit (created_at desc);
create index if not exists platform_admin_audit_cible_idx
  on public.platform_admin_audit (target_type, target_id);

alter table public.platform_admin_audit enable row level security;
revoke all on table public.platform_admin_audit from anon;
revoke all on table public.platform_admin_audit from authenticated;

-- LE verrou : ni UPDATE, ni DELETE, ni TRUNCATE. Un déclencheur s'applique à
-- TOUT LE MONDE — propriétaire de la base et clé de service comprises —, là où
-- des policies RLS ne s'appliquent ni à l'un ni à l'autre. C'est la différence
-- entre « on s'interdit de » et « on ne peut pas ».
create or replace function public.platform_admin_audit_immuable_fn()
returns trigger
language plpgsql
as $fn_audit_lock$
begin
  raise exception
    'Le journal d''administration est en écriture seule : ni modification ni suppression (tentative : %).',
    tg_op
    using errcode = '42501';
end
$fn_audit_lock$;

drop trigger if exists trg_platform_admin_audit_immuable on public.platform_admin_audit;
create trigger trg_platform_admin_audit_immuable
before update or delete on public.platform_admin_audit
for each row execute function public.platform_admin_audit_immuable_fn();

drop trigger if exists trg_platform_admin_audit_no_truncate on public.platform_admin_audit;
create trigger trg_platform_admin_audit_no_truncate
before truncate on public.platform_admin_audit
for each statement execute function public.platform_admin_audit_immuable_fn();

-- Écriture du journal. Utilisée par toutes les fonctions d'administration, dans
-- la MÊME transaction que le geste : impossible d'agir sans laisser de trace.
create or replace function public.log_admin_action(
  p_action      text,
  p_reason      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_details     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_log$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Un motif écrit est obligatoire.' using errcode = '22023';
  end if;

  insert into public.platform_admin_audit (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, btrim(p_reason), coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end
$fn_log$;

grant execute on function public.log_admin_action(text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Verrou anti-auto-nomination, au niveau de la BASE
-- ---------------------------------------------------------------------
-- Les fonctions ci-dessous le vérifient déjà. Ce déclencheur est la ceinture en
-- plus des bretelles : le jour où une fonction aura un défaut, ou qu'un écran
-- écrira directement, la base refusera quand même.
--
-- `auth.uid()` est NULL lorsqu'on agit depuis l'éditeur SQL ou la clé de
-- service : c'est ce qui permet de créer le TOUT PREMIER administrateur à la
-- main, et seulement de cette façon.

create or replace function public.platform_admins_anti_auto_fn()
returns trigger
language plpgsql
set search_path = public
as $fn_anti_auto$
begin
  if auth.uid() is not null and new.user_id = auth.uid() then
    raise exception
      'Un administrateur ne peut pas modifier son propre accès (ni se nommer lui-même).'
      using errcode = '42501';
  end if;
  return new;
end
$fn_anti_auto$;

drop trigger if exists trg_platform_admins_anti_auto on public.platform_admins;
create trigger trg_platform_admins_anti_auto
before insert or update on public.platform_admins
for each row execute function public.platform_admins_anti_auto_fn();

-- ---------------------------------------------------------------------
-- 5. Nommer et révoquer — les deux seuls chemins depuis l'application
-- ---------------------------------------------------------------------

create or replace function public.grant_platform_admin(
  p_email  text,
  p_role   text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_grant$
declare
  v_cible uuid;
  v_role  text := lower(btrim(coalesce(p_role, 'support')));
begin
  if public.platform_admin_role() is distinct from 'owner' then
    raise exception 'Seul un administrateur principal peut nommer un administrateur.'
      using errcode = '42501';
  end if;
  if v_role not in ('owner', 'support', 'finance', 'moderation') then
    raise exception 'Rôle invalide.' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Un motif écrit est obligatoire.' using errcode = '22023';
  end if;

  v_cible := (select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1);
  if v_cible is null then
    raise exception 'Aucun compte pour cette adresse e-mail.' using errcode = 'P0002';
  end if;
  if v_cible = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier votre propre accès.' using errcode = '42501';
  end if;

  insert into public.platform_admins (user_id, role, granted_by, note)
  values (v_cible, v_role, auth.uid(), btrim(p_reason))
  on conflict (user_id) do update
    set role = excluded.role,
        granted_at = now(),
        granted_by = excluded.granted_by,
        revoked_at = null,
        revoked_by = null,
        note = excluded.note;

  perform public.log_admin_action(
    'admin.grant', p_reason, 'user', v_cible::text,
    jsonb_build_object('role', v_role, 'email', lower(btrim(p_email)))
  );

  return v_cible;
end
$fn_grant$;

grant execute on function public.grant_platform_admin(text, text, text) to authenticated;

create or replace function public.revoke_platform_admin(
  p_user_id uuid,
  p_reason  text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn_revoke$
declare
  v_actifs integer;
begin
  if public.platform_admin_role() is distinct from 'owner' then
    raise exception 'Seul un administrateur principal peut révoquer un administrateur.'
      using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Un motif écrit est obligatoire.' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas révoquer votre propre accès.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.platform_admins
    where user_id = p_user_id and revoked_at is null
  ) then
    raise exception 'Cette personne n''est pas administrateur actif.' using errcode = 'P0002';
  end if;

  -- Garde-fou de survie : on ne se verrouille pas dehors.
  v_actifs := (select count(*) from public.platform_admins where revoked_at is null);
  if v_actifs <= 1 then
    raise exception 'Impossible de retirer le dernier administrateur actif de la plateforme.'
      using errcode = '42501';
  end if;

  update public.platform_admins
  set revoked_at = now(), revoked_by = auth.uid()
  where user_id = p_user_id;

  perform public.log_admin_action('admin.revoke', p_reason, 'user', p_user_id::text, '{}'::jsonb);

  return true;
end
$fn_revoke$;

grant execute on function public.revoke_platform_admin(uuid, text) to authenticated;

-- Liste des administrateurs — réservée aux administrateurs, évidemment.
create or replace function public.list_platform_admins()
returns table (
  user_id    uuid,
  email      text,
  role       text,
  granted_at timestamptz,
  revoked_at timestamptz,
  actif      boolean
)
language plpgsql
security definer
set search_path = public
as $fn_list_admins$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  return query
    select pa.user_id, lower(au.email), pa.role, pa.granted_at, pa.revoked_at,
           (pa.revoked_at is null)
    from public.platform_admins pa
    join auth.users au on au.id = pa.user_id
    order by (pa.revoked_at is null) desc, pa.granted_at desc;
end
$fn_list_admins$;

grant execute on function public.list_platform_admins() to authenticated;

-- ---------------------------------------------------------------------
-- 6. CRÉATION DU PREMIER ADMINISTRATEUR — À FAIRE UNE SEULE FOIS, À LA MAIN
-- ---------------------------------------------------------------------
-- Aucun chemin de l'application ne permet de se nommer soi-même : le tout
-- premier accès se pose ici, dans l'éditeur SQL, où `auth.uid()` est NULL —
-- c'est précisément ce que le déclencheur anti-auto-nomination autorise.
--
-- Décommenter la ligne, remplacer l'adresse, exécuter, puis RECOMMENTER.
--
-- insert into public.platform_admins (user_id, role, note)
-- select id, 'owner', 'Premier administrateur — créé manuellement'
-- from auth.users where lower(email) = lower('t.ainour@minegrid.ma')
-- on conflict (user_id) do update set revoked_at = null, role = 'owner';
