-- =====================================================================
-- MINEGRID NEXTGEN — 0002 — ESCROW + FINANCE
-- =====================================================================
-- Couche transactionnelle de confiance. RÈGLE D'OR (leçon Kobo360/Lori) :
-- MineGrid ne PORTE JAMAIS les fonds ni le risque de crédit. L'escrow est opéré
-- par un PSP partenaire (table escrow_transactions = miroir d'état + workflow) ;
-- le financement est SCORÉ puis TRANSMIS à un partenaire (aucun float). Idempotent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ESCROW — séquestre conditionné à l'inspection et à la livraison
-- ---------------------------------------------------------------------
create table if not exists public.escrow_transactions (
  id                    uuid primary key default gen_random_uuid(),
  machine_id            uuid not null,
  buyer_id              uuid not null references auth.users(id) on delete restrict,
  seller_id             uuid not null references auth.users(id) on delete restrict,
  amount                numeric(14,2) not null check (amount > 0),
  currency              text not null default 'EUR',
  -- Machine d'état du séquestre. Les fonds ne sont libérés qu'après
  -- inspection OK + livraison confirmée (anti-arnaque acompte).
  status                text not null default 'created' check (status in
                        ('created','funded','inspection_passed','delivered','released','refunded','disputed','cancelled')),
  inspection_report_id  uuid,          -- référence inspection_reports(id) (module 0001)
  provider              text,          -- PSP partenaire (ex : 'stripe_connect','flutterwave','peach')
  provider_ref          text,          -- identifiant de séquestre côté PSP
  release_conditions    jsonb not null default '{"inspection":true,"delivery":true}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_escrow_buyer  on public.escrow_transactions(buyer_id);
create index if not exists idx_escrow_seller on public.escrow_transactions(seller_id);
create index if not exists idx_escrow_status on public.escrow_transactions(status);

-- Journal d'événements (audit + suivi). Append-only.
create table if not exists public.escrow_events (
  id          uuid primary key default gen_random_uuid(),
  escrow_id   uuid not null references public.escrow_transactions(id) on delete cascade,
  event_type  text not null,         -- funded, inspection_passed, delivery_confirmed, released, refunded, dispute_opened...
  actor_id    uuid references auth.users(id),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_escrow_events_escrow on public.escrow_events(escrow_id, created_at);

-- ---------------------------------------------------------------------
-- FINANCE — MineGrid Finance (apporteur d'affaires, AUCUN risque porté)
-- ---------------------------------------------------------------------
create table if not exists public.finance_partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     text,
  products    jsonb not null default '[]'::jsonb,   -- ['leasing','credit_vendeur','invoice_finance']
  min_amount  numeric(14,2),
  max_amount  numeric(14,2),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.finance_applications (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references auth.users(id) on delete cascade,
  machine_id    uuid,
  amount        numeric(14,2) not null check (amount > 0),
  currency      text not null default 'EUR',
  term_months   int check (term_months between 1 and 120),
  -- draft/submitted = client ; scoring/forwarded/approved/rejected = serveur.
  status        text not null default 'draft' check (status in
                ('draft','submitted','scoring','forwarded','approved','rejected','cancelled')),
  score         int check (score between 0 and 100),   -- écrit par le moteur de scoring serveur
  partner_id    uuid references public.finance_partners(id) on delete set null,
  dossier       jsonb not null default '{}'::jsonb,     -- pièces : Kbis/RC, bilans, RIB (URLs signées)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_finance_applicant on public.finance_applications(applicant_id);
create index if not exists idx_finance_status on public.finance_applications(status);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.escrow_transactions enable row level security;
alter table public.escrow_events       enable row level security;
alter table public.finance_partners    enable row level security;
alter table public.finance_applications enable row level security;

-- escrow_transactions : acheteur ET vendeur voient leur transaction. Les
-- transitions d'état (funded/released/refunded) sont écrites par le serveur
-- (webhook PSP via service_role) — JAMAIS par le client.
drop policy if exists escrow_select_party on public.escrow_transactions;
create policy escrow_select_party on public.escrow_transactions
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());

-- escrow_events : visibles aux parties de la transaction liée.
drop policy if exists escrow_events_select_party on public.escrow_events;
create policy escrow_events_select_party on public.escrow_events
  for select to authenticated using (
    exists (select 1 from public.escrow_transactions e
            where e.id = escrow_events.escrow_id
              and (e.buyer_id = auth.uid() or e.seller_id = auth.uid()))
  );

-- finance_partners : lecture publique (catalogue d'offres), écriture service_role.
drop policy if exists finance_partners_select_public on public.finance_partners;
create policy finance_partners_select_public on public.finance_partners
  for select to anon, authenticated using (active = true);

-- finance_applications : le demandeur voit les siennes et peut créer/soumettre
-- (status draft|submitted). Le scoring et la transmission partenaire = serveur.
drop policy if exists finance_apps_select_own on public.finance_applications;
create policy finance_apps_select_own on public.finance_applications
  for select to authenticated using (applicant_id = auth.uid());
drop policy if exists finance_apps_insert_own on public.finance_applications;
create policy finance_apps_insert_own on public.finance_applications
  for insert to authenticated with check (
    applicant_id = auth.uid() and status in ('draft','submitted')
  );
drop policy if exists finance_apps_update_own_draft on public.finance_applications;
create policy finance_apps_update_own_draft on public.finance_applications
  for update to authenticated
  using (applicant_id = auth.uid() and status in ('draft','submitted'))
  with check (applicant_id = auth.uid() and status in ('draft','submitted'));

-- Verrous : aucune écriture directe sur escrow ni sur le scoring finance côté client.
revoke insert, update, delete on public.escrow_transactions from anon, authenticated;
revoke insert, update, delete on public.escrow_events       from anon, authenticated;
revoke insert, update, delete on public.finance_partners    from anon, authenticated;
revoke delete                 on public.finance_applications from anon, authenticated;
