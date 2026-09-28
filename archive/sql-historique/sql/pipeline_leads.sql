-- =====================================================================
-- Table `leads` : pipeline commercial utilisateur (Kanban dashboard).
-- Les widgets "Pipeline commercial" et "Actions commerciales" s'appuient
-- sur cette table (voir `src/utils/correlateLeadActions.ts`).
-- A executer une seule fois dans Supabase SQL Editor.
-- =====================================================================

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null,
  title           text not null,
  stage           text not null default 'Prospection',
  priority        text not null default 'medium',
  value           numeric not null default 0,
  probability     integer not null default 10,
  next_action     text,
  assigned_to     text,
  last_contact    timestamptz not null default now(),
  notes           text,
  contact_name    text,
  contact_company text,
  contact_phone   text,
  contact_email   text,
  source          text default 'manual',
  source_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint leads_stage_check check (
    stage in ('Prospection', 'Qualification', 'Devis', 'Proposition', 'Négociation', 'Conclu', 'Perdu')
  ),
  constraint leads_priority_check check (priority in ('high', 'medium', 'low')),
  constraint leads_probability_check check (probability between 0 and 100)
);

create index if not exists leads_seller_created_idx
  on public.leads (seller_id, created_at desc);

create index if not exists leads_source_idx
  on public.leads (source, source_id);

alter table public.leads enable row level security;

drop policy if exists "users can read own leads" on public.leads;
create policy "users can read own leads"
  on public.leads
  for select
  to authenticated
  using (auth.uid() = seller_id);

drop policy if exists "users can insert own leads" on public.leads;
create policy "users can insert own leads"
  on public.leads
  for insert
  to authenticated
  with check (auth.uid() = seller_id);

drop policy if exists "users can update own leads" on public.leads;
create policy "users can update own leads"
  on public.leads
  for update
  to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

drop policy if exists "users can delete own leads" on public.leads;
create policy "users can delete own leads"
  on public.leads
  for delete
  to authenticated
  using (auth.uid() = seller_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;

-- Liens cycle vente / demandes (idempotent pour bases existantes)
alter table public.leads add column if not exists machine_id uuid;
alter table public.leads add column if not exists quote_request_id uuid;
alter table public.leads add column if not exists buyer_user_id uuid references auth.users (id) on delete set null;

create index if not exists leads_machine_id_idx on public.leads (machine_id) where machine_id is not null;
create index if not exists leads_quote_request_idx on public.leads (quote_request_id) where quote_request_id is not null;
create index if not exists leads_buyer_user_idx on public.leads (buyer_user_id) where buyer_user_id is not null;

drop policy if exists "users can read leads as buyer" on public.leads;
create policy "users can read leads as buyer" on public.leads
  for select to authenticated
  using (buyer_user_id is not null and auth.uid() = buyer_user_id);

-- Dossier transaction (optionnel ; FK seulement si transaction_cases existe deja)
alter table public.leads add column if not exists transaction_case_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_transaction_case_fk')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transaction_cases')
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'leads' and column_name = 'transaction_case_id'
     ) then
    alter table public.leads
      add constraint leads_transaction_case_fk
      foreign key (transaction_case_id) references public.transaction_cases (id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

create index if not exists leads_transaction_case_idx
  on public.leads (transaction_case_id) where transaction_case_id is not null;
