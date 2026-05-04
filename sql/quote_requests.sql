-- =====================================================================
-- Table `quote_requests` : leads commerciaux depuis les fiches machine.
-- À exécuter une seule fois dans Supabase SQL Editor.
-- =====================================================================

create table if not exists public.quote_requests (
  id           uuid primary key default gen_random_uuid(),
  machine_id   uuid not null,
  machine_name text not null,
  brand        text,
  seller_id    uuid,
  buyer_name   text not null,
  buyer_email  text not null,
  buyer_phone  text,
  country      text,
  budget_min   numeric,
  budget_max   numeric,
  need_by_date date,
  message      text,
  source       text default 'machine_detail',
  status       text not null default 'new',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint quote_requests_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed'))
);

create index if not exists quote_requests_created_at_idx
  on public.quote_requests (created_at desc);

create index if not exists quote_requests_status_idx
  on public.quote_requests (status);

create index if not exists quote_requests_seller_idx
  on public.quote_requests (seller_id);

alter table public.quote_requests enable row level security;

-- Insert anonyme/authentifié autorisé pour capter les leads publics.
drop policy if exists "anon can insert quote requests" on public.quote_requests;
create policy "anon can insert quote requests"
  on public.quote_requests
  for insert
  to anon, authenticated
  with check (true);

-- Lecture/mise à jour réservées aux utilisateurs authentifiés (backoffice).
drop policy if exists "auth can read quote requests" on public.quote_requests;
create policy "auth can read quote requests"
  on public.quote_requests
  for select
  to authenticated
  using (true);

drop policy if exists "auth can update quote requests" on public.quote_requests;
create policy "auth can update quote requests"
  on public.quote_requests
  for update
  to authenticated
  using (true)
  with check (true);

-- Droits PostgREST : le front utilise la clé anon pour insérer un lead public.
-- Pas de SELECT pour anon : l’app utilise insert sans .select() (voir submitQuoteRequest).
grant usage on schema public to anon, authenticated;
grant insert on table public.quote_requests to anon, authenticated;
grant select, update on table public.quote_requests to authenticated;

-- Si vous aviez ajouté une policy "anon can read" pour contourner .select() après insert,
-- vous pouvez la retirer une fois le front à jour :
-- drop policy if exists "anon can read quote requests" on public.quote_requests;
