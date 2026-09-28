/*
  Idempotent : bases deja deployees sans colonnes ni nouvelles policies.
  Ordre : 1) sql/transaction_platform_core.sql  2) ce script
*/

-- quote_requests : colonnes
alter table public.quote_requests add column if not exists buyer_user_id uuid references auth.users (id) on delete set null;
alter table public.quote_requests add column if not exists transaction_case_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quote_requests_transaction_case_fk')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transaction_cases')
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'quote_requests' and column_name = 'transaction_case_id'
     ) then
    alter table public.quote_requests
      add constraint quote_requests_transaction_case_fk
      foreign key (transaction_case_id) references public.transaction_cases (id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

create index if not exists quote_requests_buyer_user_idx
  on public.quote_requests (buyer_user_id) where buyer_user_id is not null;

alter table public.quote_requests enable row level security;

drop policy if exists "anon can insert quote requests" on public.quote_requests;
drop policy if exists "auth can read quote requests" on public.quote_requests;
drop policy if exists "auth can update quote requests" on public.quote_requests;
drop policy if exists quote_requests_insert_anon on public.quote_requests;
drop policy if exists quote_requests_insert_authenticated on public.quote_requests;
drop policy if exists quote_requests_select_party on public.quote_requests;
drop policy if exists quote_requests_update_party on public.quote_requests;

create policy quote_requests_insert_anon on public.quote_requests for insert to anon with check (true);
create policy quote_requests_insert_authenticated on public.quote_requests for insert to authenticated
  with check (buyer_user_id is not null and buyer_user_id = auth.uid());
create policy quote_requests_select_party on public.quote_requests for select to authenticated
  using (
    (seller_id is not null and seller_id = auth.uid())
    or (buyer_user_id is not null and buyer_user_id = auth.uid())
    or (
      buyer_email is not null
      and lower(trim(buyer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
    )
  );
create policy quote_requests_update_party on public.quote_requests for update to authenticated
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

-- leads : liens cycle vente
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
