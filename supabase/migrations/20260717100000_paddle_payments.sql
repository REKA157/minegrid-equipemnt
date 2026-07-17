-- Paddle (Merchant of Record) — infrastructure de paiement des abonnements.
-- Pendant Paddle de l'infrastructure Stripe existante :
--   1) Table d'idempotence des webhooks (miroir de processed_stripe_events) :
--      Paddle livre at-least-once, l'event_id est « claimé » une seule fois.
--      Aucune policy : la table n'est accessible qu'en service_role (webhook).
--   2) Colonnes de traçabilité Paddle sur pro_clients (transaction + abonnement).
-- Idempotente (IF NOT EXISTS partout) — sûre à rejouer sur staging ET prod.

create table if not exists public.processed_paddle_events (
  event_id    text primary key,
  event_type  text,
  received_at timestamptz not null default now()
);

alter table public.processed_paddle_events enable row level security;
revoke all on table public.processed_paddle_events from public;
revoke all on table public.processed_paddle_events from anon;
revoke all on table public.processed_paddle_events from authenticated;

alter table public.pro_clients
  add column if not exists paddle_transaction_id text;
alter table public.pro_clients
  add column if not exists paddle_subscription_id text;

-- Assainissement : la variante historique 'entreprise' (français) casse tout
-- lookup par code canonique (PLAN_RANK, PRICE_ID_TO_PLAN). Le front normalise
-- déjà à la lecture ; on corrige aussi la donnée à la source (idempotent).
update public.pro_clients
   set subscription_type = 'enterprise'
 where subscription_type = 'entreprise';

comment on table public.processed_paddle_events is
  'Idempotence des webhooks Paddle (event_id claimé une seule fois par paddle-webhook, service_role uniquement).';
