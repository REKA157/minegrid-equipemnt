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

-- UN ABONNEMENT PAR UTILISATEUR : requis par l'upsert `onConflict: user_id` du
-- webhook (sans contrainte unique, Postgres renvoie 42P10 et l'activation échoue
-- en boucle — constaté sur le staging le 2026-07-20). On dédoublonne d'abord en
-- gardant la ligne la plus récente (préviendra le cas prod), puis on pose l'index.
delete from public.pro_clients p
 where exists (
   select 1
     from public.pro_clients q
    where q.user_id = p.user_id
      and (q.updated_at > p.updated_at
           or (q.updated_at = p.updated_at and q.id > p.id))
 );

create unique index if not exists pro_clients_user_id_key
  on public.pro_clients (user_id);
