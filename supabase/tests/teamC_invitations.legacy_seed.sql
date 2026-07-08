-- =====================================================================
-- SEED « base migrée depuis l'ancien schéma pro-portal », à charger APRÈS
-- teamC_invitations.prereq.sql et AVANT la migration 20260708140000.
--
-- Reproduit le DANGER identifié par l'audit :
--   - user_invitations SANS organization_id / token / name (ancien schéma) ;
--   - policies RLS HÉRITÉES non scopées par société (client_users role='admin') ;
--   - table client_users + un attaquant qui en est « admin » sans être membre
--     d'une organisation.
-- La migration doit : ajouter les colonnes manquantes, SUPPRIMER ces policies,
-- révoquer l'écriture directe -> l'injection/fuite inter-société devient impossible.
-- =====================================================================

-- Ancienne table client_users (modèle pro-portal).
create table if not exists public.client_users (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null,
  role      text not null default 'viewer',
  is_active boolean not null default true
);
grant select, insert, update, delete on public.client_users to authenticated;

-- L'attaquant : « admin » client_users, mais membre d'AUCUNE organisation.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'attacker@evil.ma');
insert into public.client_users (user_id, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'admin');

-- Ancienne table user_invitations : PAS d'organization_id, PAS de token, PAS de name.
create table public.user_invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text,
  invited_by  uuid,
  status      text default 'pending',
  expires_at  timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.user_invitations enable row level security;
-- GRANT ALL comme le fait Supabase par défaut (c'est ce que la migration révoque).
grant select, insert, update, delete on public.user_invitations to authenticated;

-- Policies HÉRITÉES non scopées par société (le vecteur d'attaque).
create policy "Les administrateurs peuvent voir toutes les invitations" on public.user_invitations
  for all using (
    exists (select 1 from public.client_users c where c.user_id = auth.uid() and c.role = 'admin')
  );
create policy "Les utilisateurs peuvent voir leurs invitations" on public.user_invitations
  for select using (
    email = (select au.email from auth.users au where au.id = auth.uid())
  );
