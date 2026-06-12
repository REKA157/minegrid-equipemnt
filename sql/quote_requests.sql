-- =====================================================================
-- Table `quote_requests` : leads depuis les fiches machine.
-- Securite : lecture / mise a jour reservees au vendeur (seller_id) ou
-- a l acheteur identifie (buyer_user_id ou email JWT = buyer_email).
--
-- Ordre deploiement recommande :
--   1) sql/transaction_platform_core.sql (optionnel mais conseille pour FK dossier)
--   2) ce script (idempotent) ou patch_quote_requests_and_leads.sql si deja ancienne table
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
  buyer_user_id uuid references auth.users (id) on delete set null,
  transaction_case_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint quote_requests_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed'))
);

-- Ancienne table deja creee : CREATE IF NOT EXISTS ne ajoute pas les nouvelles colonnes.
alter table public.quote_requests add column if not exists buyer_user_id uuid references auth.users (id) on delete set null;
alter table public.quote_requests add column if not exists transaction_case_id uuid;

-- FK dossier lorsque transaction_cases existe deja
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quote_requests_transaction_case_fk'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transaction_cases'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quote_requests'
      and column_name = 'transaction_case_id'
  ) then
    alter table public.quote_requests
      add constraint quote_requests_transaction_case_fk
      foreign key (transaction_case_id)
      references public.transaction_cases (id)
      on delete set null;
  end if;
exception
  when duplicate_object then null;
end $$;

create index if not exists quote_requests_created_at_idx
  on public.quote_requests (created_at desc);

create index if not exists quote_requests_status_idx
  on public.quote_requests (status);

create index if not exists quote_requests_seller_idx
  on public.quote_requests (seller_id);

create index if not exists quote_requests_buyer_user_idx
  on public.quote_requests (buyer_user_id)
  where buyer_user_id is not null;

alter table public.quote_requests enable row level security;

drop policy if exists "anon can insert quote requests" on public.quote_requests;
drop policy if exists quote_requests_insert_anon on public.quote_requests;
create policy quote_requests_insert_anon
  on public.quote_requests
  for insert
  to anon
  with check (true);

drop policy if exists quote_requests_insert_authenticated on public.quote_requests;
create policy quote_requests_insert_authenticated
  on public.quote_requests
  for insert
  to authenticated
  with check (
    buyer_user_id is not null
    and buyer_user_id = auth.uid()
  );

drop policy if exists "auth can read quote requests" on public.quote_requests;
drop policy if exists quote_requests_select_party on public.quote_requests;
create policy quote_requests_select_party
  on public.quote_requests
  for select
  to authenticated
  using (
    (seller_id is not null and seller_id = auth.uid())
    or (buyer_user_id is not null and buyer_user_id = auth.uid())
    or (
      buyer_email is not null
      and lower(trim(buyer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
    )
  );

drop policy if exists "auth can update quote requests" on public.quote_requests;
drop policy if exists quote_requests_update_party on public.quote_requests;
create policy quote_requests_update_party
  on public.quote_requests
  for update
  to authenticated
  using (
    (seller_id is not null and seller_id = auth.uid())
    or (buyer_user_id is not null and buyer_user_id = auth.uid())
    or (
      buyer_email is not null
      and lower(trim(buyer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  )
  with check (
    (seller_id is not null and seller_id = auth.uid())
    or (buyer_user_id is not null and buyer_user_id = auth.uid())
    or (
      buyer_email is not null
      and lower(trim(buyer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

grant usage on schema public to anon, authenticated;
grant insert on table public.quote_requests to anon, authenticated;
grant select, update on table public.quote_requests to authenticated;
