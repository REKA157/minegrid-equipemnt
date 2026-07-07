-- =====================================================================
-- PREUVE REPRODUCTIBLE — migration P7 (trust recompute on verification)
-- Rejouer sur un Postgres jetable :
--   docker run -d --rm --name t -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/p7_trust_recompute.prereq.sql \
--       supabase/migrations/20260703093000_p7_trust_recompute_on_verification.sql \
--       supabase/tests/p7_trust_recompute.scenario.sql \
--     | docker exec -i t psql -U postgres -d test -v ON_ERROR_STOP=1
-- Attendu : score 0 -> 35, tier unverified -> basic, exit 0.
-- =====================================================================
-- Prérequis MINIMAUX pour tester la migration P7 hors Supabase (Postgres nu).
-- Reproduit uniquement les colonnes réellement lues par le trigger/recompute.
-- Rôle Supabase absent d'un Postgres nu : on le crée pour le test uniquement.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

create table if not exists public.trust_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null default 'seller',
  trust_score int  not null default 0,
  trust_tier  text not null default 'unverified',
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.verifications (
  id               uuid primary key default gen_random_uuid(),
  trust_profile_id uuid not null references public.trust_profiles(id) on delete cascade,
  kind             text not null,
  status           text not null default 'pending',
  created_at       timestamptz not null default now()
);

create table if not exists public.inspection_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid,
  status       text not null default 'requested'
);
create table if not exists public.inspection_reports (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid,
  certified     boolean not null default false,
  overall_grade text
);
create table if not exists public.escrow_transactions (
  id       uuid primary key default gen_random_uuid(),
  buyer_id uuid,
  seller_id uuid,
  status   text not null default 'created'
);
