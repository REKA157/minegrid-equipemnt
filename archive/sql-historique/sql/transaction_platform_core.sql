/*
  Socle "dossier transaction" Minegrid v1 — a executer sur Supabase apres auth.
  Objectifs : unifier IDs metier (dossier) + participants + audit leger.
  Les metiers existants (transport, courtier, etc.) pourront referencer transaction_cases.id.
*/

create table if not exists public.transaction_cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'sale'
    check (kind in ('sale', 'rental', 'financing', 'other')),
  status text not null default 'draft'
    check (status in (
      'draft', 'qualified', 'negotiation', 'contract', 'payment',
      'logistics', 'customs', 'delivery', 'closed', 'cancelled'
    )),
  machine_id uuid,
  seller_user_id uuid not null references auth.users (id) on delete cascade,
  buyer_user_id uuid references auth.users (id) on delete set null,
  primary_quote_request_id uuid,
  primary_lead_id uuid,
  title text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists transaction_cases_seller_idx
  on public.transaction_cases (seller_user_id, created_at desc);
create index if not exists transaction_cases_buyer_idx
  on public.transaction_cases (buyer_user_id)
  where buyer_user_id is not null;
create index if not exists transaction_cases_machine_idx
  on public.transaction_cases (machine_id)
  where machine_id is not null;
create index if not exists transaction_cases_quote_idx
  on public.transaction_cases (primary_quote_request_id)
  where primary_quote_request_id is not null;

create table if not exists public.transaction_participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.transaction_cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    check (role in (
      'seller', 'buyer', 'broker', 'mechanic', 'carrier',
      'forwarder', 'logistician', 'investor', 'admin_delegate', 'other'
    )),
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  scope jsonb default '{}'::jsonb,
  unique (case_id, user_id, role)
);

create index if not exists transaction_participants_case_idx
  on public.transaction_participants (case_id);
create index if not exists transaction_participants_user_idx
  on public.transaction_participants (user_id)
  where revoked_at is null;

create table if not exists public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.transaction_cases (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transaction_events_case_idx
  on public.transaction_events (case_id, created_at desc);

-- Acces dossier : vendeur, acheteur inscrit sur le dossier, ou participant actif
create or replace function public.can_access_transaction_case(p_case_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (c.seller_user_id = p_uid or c.buyer_user_id = p_uid)
  )
  or exists (
    select 1 from public.transaction_participants p
    where p.case_id = p_case_id
      and p.user_id = p_uid
      and p.revoked_at is null
  );
$$;

grant execute on function public.can_access_transaction_case(uuid, uuid) to authenticated;

create or replace function public.transaction_cases_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_transaction_cases_updated_at on public.transaction_cases;
create trigger trg_transaction_cases_updated_at
  before update on public.transaction_cases
  for each row execute function public.transaction_cases_set_updated_at();

alter table public.transaction_cases enable row level security;
alter table public.transaction_participants enable row level security;
alter table public.transaction_events enable row level security;

drop policy if exists transaction_cases_select on public.transaction_cases;
create policy transaction_cases_select on public.transaction_cases
  for select to authenticated
  using (public.can_access_transaction_case(id, auth.uid()));

drop policy if exists transaction_cases_insert on public.transaction_cases;
create policy transaction_cases_insert on public.transaction_cases
  for insert to authenticated
  with check (
    seller_user_id = auth.uid()
    or (
      buyer_user_id = auth.uid()
      and seller_user_id is not null
      and seller_user_id <> auth.uid()
    )
  );

drop policy if exists transaction_cases_update on public.transaction_cases;
create policy transaction_cases_update on public.transaction_cases
  for update to authenticated
  using (public.can_access_transaction_case(id, auth.uid()))
  with check (public.can_access_transaction_case(id, auth.uid()));

drop policy if exists transaction_cases_delete on public.transaction_cases;
create policy transaction_cases_delete on public.transaction_cases
  for delete to authenticated
  using (seller_user_id = auth.uid());

drop policy if exists transaction_participants_select on public.transaction_participants;
create policy transaction_participants_select on public.transaction_participants
  for select to authenticated
  using (public.can_access_transaction_case(case_id, auth.uid()));

drop policy if exists transaction_participants_insert on public.transaction_participants;
-- Aligné avec transaction_platform_extended : l’acheteur qui a ouvert le dossier depuis
-- un devis peut s’enregistrer en « buyer » et inviter le vendeur de l’annonce en « seller ».
create policy transaction_participants_insert on public.transaction_participants
  for insert to authenticated
  with check (
    exists (
      select 1 from public.transaction_cases c
      where c.id = case_id
        and c.seller_user_id = auth.uid()
    )
    or exists (
      select 1 from public.transaction_cases c
      where c.id = case_id
        and c.buyer_user_id = auth.uid()
        and user_id = auth.uid()
        and role = 'buyer'
    )
    or exists (
      select 1 from public.transaction_cases c
      where c.id = case_id
        and c.buyer_user_id = auth.uid()
        and user_id = c.seller_user_id
        and role = 'seller'
    )
    or exists (
      select 1 from public.transaction_participants p
      where p.case_id = case_id
        and p.user_id = auth.uid()
        and p.revoked_at is null
        and p.role in ('broker', 'admin_delegate')
    )
  );

drop policy if exists transaction_participants_update on public.transaction_participants;
create policy transaction_participants_update on public.transaction_participants
  for update to authenticated
  using (
    exists (
      select 1 from public.transaction_cases c
      where c.id = case_id and c.seller_user_id = auth.uid()
    )
  );

drop policy if exists transaction_events_select on public.transaction_events;
create policy transaction_events_select on public.transaction_events
  for select to authenticated
  using (public.can_access_transaction_case(case_id, auth.uid()));

drop policy if exists transaction_events_insert on public.transaction_events;
create policy transaction_events_insert on public.transaction_events
  for insert to authenticated
  with check (
    public.can_access_transaction_case(case_id, auth.uid())
    and (actor_user_id is null or actor_user_id = auth.uid())
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.transaction_cases to authenticated;
grant select, insert, update on public.transaction_participants to authenticated;
grant select, insert on public.transaction_events to authenticated;
