-- =====================================================================
-- PREREQ pour prouver le verrouillage du scoring finance_applications (P9).
-- Reproduit l'ÉTAT BASELINE (nextgen/0002) : UPDATE toutes colonnes accordé au
-- client. La migration P9 (concaténée ensuite) doit retirer score/partner_id.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('test.uid', true), '')::uuid
$fn$;

create table if not exists public.finance_partners (
  id uuid primary key default gen_random_uuid(), active boolean not null default true
);
create table if not exists public.finance_applications (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references auth.users(id) on delete cascade,
  machine_id    uuid,
  amount        numeric(14,2) not null check (amount > 0),
  currency      text not null default 'EUR',
  term_months   int check (term_months between 1 and 120),
  status        text not null default 'draft' check (status in
                ('draft','submitted','scoring','forwarded','approved','rejected','cancelled')),
  score         int check (score between 0 and 100),
  partner_id    uuid references public.finance_partners(id) on delete set null,
  dossier       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.finance_applications enable row level security;
drop policy if exists finance_apps_select_own on public.finance_applications;
create policy finance_apps_select_own on public.finance_applications
  for select to authenticated using (applicant_id = auth.uid());
drop policy if exists finance_apps_insert_own on public.finance_applications;
create policy finance_apps_insert_own on public.finance_applications
  for insert to authenticated with check (applicant_id = auth.uid() and status in ('draft','submitted'));
drop policy if exists finance_apps_update_own_draft on public.finance_applications;
create policy finance_apps_update_own_draft on public.finance_applications
  for update to authenticated
  using (applicant_id = auth.uid() and status in ('draft','submitted'))
  with check (applicant_id = auth.uid() and status in ('draft','submitted'));

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
-- ÉTAT BASELINE : UPDATE toutes colonnes accordé (la faille). La migration le retire.
grant select, insert, update on public.finance_applications to authenticated;

-- Semis : A (..a1) demandeur, B (..b1) tiers, partenaire P, dossier FA (brouillon).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.finance_partners (id, active) values ('0f000000-0000-0000-0000-0000000000f1', true);
insert into public.finance_applications (id, applicant_id, amount, status) values
  ('0fa00000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 5000, 'submitted');
