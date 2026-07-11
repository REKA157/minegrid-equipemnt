-- =====================================================================
-- MODÈLE ÉQUIPE — Phase H : HISTORIQUE DES SESSIONS (connexion / déconnexion)
--
-- Objectif : le propriétaire (ou un admin) d'une société voit les heures de
-- CONNEXION et de DÉCONNEXION de chacun de ses agents, dans Gestion d'équipe.
--
-- Stockage SERVEUR (autoritaire, partagé, indépendant du navigateur) :
--   table member_sessions (org, user) -> (login_at, logout_at, user_agent).
--
-- SÉCURITÉ :
--  - RLS lecture : un membre voit SES sessions ; un admin/owner voit celles de
--    TOUTE SA société (user_in_org_admin) — jamais celles d'une autre société ;
--  - écritures UNIQUEMENT via RPC (record_session_login / record_session_logout,
--    SECURITY DEFINER) : le client ne peut ni mentir sur l'org, ni fermer la
--    session d'un autre (garde user_id = auth.uid()) ;
--  - org du membre dérivée CÔTÉ SERVEUR (multi-org : propriétaire d'abord, puis
--    adhésion la plus ancienne — même règle que get_my_member_scope / leads) ;
--  - anti-doublon : deux « SIGNED_IN » rapprochés (multi-onglets) ne créent
--    qu'UNE session (fenêtre 2 minutes) ;
--  - search_path=public verrouillé sur toutes les fonctions ;
--  - délimiteur $fn$ (jamais $$) : l'éditeur SQL Supabase gère mal les $$ multiples.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table des sessions.
-- ---------------------------------------------------------------------
create table if not exists public.member_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  login_at        timestamptz not null default now(),
  logout_at       timestamptz,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists member_sessions_org_login_idx
  on public.member_sessions (organization_id, login_at desc);
create index if not exists member_sessions_user_login_idx
  on public.member_sessions (user_id, login_at desc);

alter table public.member_sessions enable row level security;

-- Lecture : ses propres sessions, OU (admin/owner) toutes celles de sa société.
drop policy if exists member_sessions_select on public.member_sessions;
create policy member_sessions_select on public.member_sessions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.user_in_org_admin(organization_id, auth.uid())
  );

-- Écritures : aucune en direct — on force le passage par les RPC ci-dessous.
revoke all on public.member_sessions from anon, authenticated;
grant select on public.member_sessions to authenticated;

-- ---------------------------------------------------------------------
-- 2. Enregistrer une CONNEXION. Renvoie l'id de session (à mémoriser côté
--    client pour la déconnexion). Renvoie NULL si l'utilisateur n'est dans
--    aucune société (compte perso : pas de suivi d'équipe).
-- ---------------------------------------------------------------------
create or replace function public.record_session_login(p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  -- Org du membre (multi-org : propriétaire d'abord, puis la plus ancienne).
  select organization_id
    into v_org
  from public.organization_members
  where user_id = v_uid
  order by (role = 'owner') desc, created_at
  limit 1;

  if v_org is null then
    return null; -- pas d'organisation -> pas de suivi de session
  end if;

  -- Anti-doublon : réutilise une session très récente (multi-onglets / re-fire
  -- de SIGNED_IN) au lieu d'en créer une seconde.
  select id
    into v_id
  from public.member_sessions
  where user_id = v_uid
    and login_at > now() - interval '2 minutes'
  order by login_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.member_sessions (organization_id, user_id, login_at, user_agent)
  values (v_org, v_uid, now(), left(p_user_agent, 400))
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.record_session_login(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Enregistrer une DÉCONNEXION. Ne ferme QUE sa propre session, et
--    seulement si elle est encore ouverte (idempotent). À appeler AVANT
--    supabase.auth.signOut() (après, auth.uid() est null).
-- ---------------------------------------------------------------------
create or replace function public.record_session_logout(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  update public.member_sessions
     set logout_at = now()
   where id = p_session_id
     and user_id = v_uid       -- on ne ferme QUE sa propre session
     and logout_at is null;    -- idempotent : ne réécrit pas une session déjà fermée
end;
$fn$;

grant execute on function public.record_session_logout(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Historique des sessions d'UN membre (pour l'affichage dans Gestion
--    d'équipe). Autorisé si l'appelant EST ce membre, OU est admin/owner de
--    la société de ce membre. Sinon : 0 ligne.
-- ---------------------------------------------------------------------
create or replace function public.get_member_sessions(p_user_id uuid, p_limit int default 50)
returns table (
  id         uuid,
  user_id    uuid,
  login_at   timestamptz,
  logout_at  timestamptz,
  user_agent text
)
language sql
security definer
set search_path = public
stable
as $fn$
  select s.id, s.user_id, s.login_at, s.logout_at, s.user_agent
  from public.member_sessions s
  where s.user_id = p_user_id
    and (
      s.user_id = auth.uid()
      or public.user_in_org_admin(s.organization_id, auth.uid())
    )
  order by s.login_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;

grant execute on function public.get_member_sessions(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Statistique « connectés aujourd'hui » (nb de membres distincts ayant
--    ouvert une session aujourd'hui) — réservé aux admins/owner de l'org.
--    Remplace la valeur codée en dur de la carte statistique.
-- ---------------------------------------------------------------------
create or replace function public.get_org_session_stats()
returns int
language sql
security definer
set search_path = public
stable
as $fn$
  select coalesce(count(distinct s.user_id), 0)::int
  from public.member_sessions s
  join public.organization_members me
    on me.organization_id = s.organization_id
   and me.user_id = auth.uid()
   and me.role in ('owner', 'admin')
  where s.login_at::date = current_date;
$fn$;

grant execute on function public.get_org_session_stats() to authenticated;
