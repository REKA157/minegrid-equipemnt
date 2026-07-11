-- =====================================================================
-- P13 — Idempotence du webhook Stripe (F-014)
-- =====================================================================
-- FAILLE : stripe-webhook n'a aucune déduplication par event.id. Stripe livre
-- at-least-once et retente jusqu'à 3 jours -> un rejeu ré-active/prolonge
-- l'abonnement (recalcul de la fenêtre à Date.now()) et peut RESSUSCITER un
-- abonnement passé à 'inactive'. Cette table sert de clé d'idempotence : le
-- webhook « claim » chaque event.id UNE fois (primary key) avant d'activer.
--
-- Écrite/lue UNIQUEMENT par service_role (le webhook). Aucun accès client. Idempotent.
-- =====================================================================

create table if not exists public.processed_stripe_events (
  event_id     text primary key,
  event_type   text,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;

-- Aucun accès client (ni policy, ni grant) : réservé au service_role (webhook).
revoke all on public.processed_stripe_events from anon, authenticated;
