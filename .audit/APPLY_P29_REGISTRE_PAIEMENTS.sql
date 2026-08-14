-- =====================================================================
-- p29 — REGISTRE DES PAIEMENTS D'ABONNEMENT
--
-- LE PROBLÈME, à poser AVANT le premier vrai paiement
--   Aujourd'hui, rien n'historise les encaissements. `pro_clients` ne conserve
--   que l'ÉTAT COURANT : chaque webhook écrase le précédent. Un client qui paie
--   douze mois laisse une seule ligne, celle du dernier mois. Le chiffre
--   d'affaires du premier mois d'activité serait donc perdu sans retour — on ne
--   peut pas reconstituer après coup ce qu'on n'a jamais écrit.
--
--   `payment_records`, qui existe déjà, ne convient pas : elle sert aux
--   transactions entre acheteurs et vendeurs (`transaction_case_id NOT NULL`),
--   pas aux abonnements. Deux sujets distincts, deux tables.
--
-- LE PIÈGE DES MONTANTS, vérifié dans le code
--   Le webhook écrit `payment_amount: params.amountCents` dans une colonne
--   `numeric(12,2)` : un abonnement à 20 $ y figure « 2000.00 ». Additionner
--   cette colonne donnerait un chiffre d'affaires cent fois trop grand. Le
--   registre nomme donc sa colonne `amount_cents`, sans ambiguïté possible, et
--   un commentaire est posé sur l'ancienne pour que le piège soit visible depuis
--   la base elle-même.
--
-- IMMUABLE, comme le journal d'administration : un registre comptable qu'on peut
--   réécrire ne vaut rien. Ni UPDATE, ni DELETE, ni TRUNCATE — y compris pour le
--   propriétaire de la base et la clé de service.
--
-- Idempotente. Délimiteurs nommés.
-- =====================================================================

create table if not exists public.subscription_payments (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users (id) on delete set null,
  -- Identifiant de transaction Paddle : UNIQUE, c'est lui qui rend le registre
  -- insensible aux relivraisons de webhook (Paddle réémet volontiers).
  paddle_transaction_id  text unique,
  paddle_subscription_id text,
  event_type             text not null,
  plan                   text,
  -- EN CENTIMES, et le nom le dit. C'est l'unité que Paddle renvoie.
  amount_cents           bigint,
  currency               text default 'USD',
  occurred_at            timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

create index if not exists subscription_payments_date_idx
  on public.subscription_payments (occurred_at desc);
create index if not exists subscription_payments_user_idx
  on public.subscription_payments (user_id);

alter table public.subscription_payments enable row level security;
revoke all on table public.subscription_payments from anon;
revoke all on table public.subscription_payments from authenticated;

-- Le verrou : un registre d'encaissements ne se corrige pas, il se complète.
create or replace function public.subscription_payments_immuable_fn()
returns trigger
language plpgsql
as $fn_pay_lock$
begin
  raise exception
    'Le registre des paiements est en écriture seule : ni modification ni suppression (tentative : %).',
    tg_op
    using errcode = '42501';
end
$fn_pay_lock$;

drop trigger if exists trg_subscription_payments_immuable on public.subscription_payments;
create trigger trg_subscription_payments_immuable
before update or delete on public.subscription_payments
for each row execute function public.subscription_payments_immuable_fn();

drop trigger if exists trg_subscription_payments_no_truncate on public.subscription_payments;
create trigger trg_subscription_payments_no_truncate
before truncate on public.subscription_payments
for each statement execute function public.subscription_payments_immuable_fn();

-- Le piège rendu visible depuis la base, pour qui lirait le schéma sans avoir lu
-- ce fichier.
comment on column public.pro_clients.payment_amount is
  'ATTENTION : valeur en CENTIMES malgre le type numeric(12,2) (20 USD = 2000.00). '
  'Ne JAMAIS additionner cette colonne. Source de verite des encaissements : '
  'public.subscription_payments.amount_cents.';

comment on column public.subscription_payments.amount_cents is
  'Montant en CENTIMES, tel que renvoye par Paddle. Diviser par 100 pour afficher.';

-- ---------------------------------------------------------------------
-- Lecture, réservée aux administrateurs
-- ---------------------------------------------------------------------

create or replace function public.admin_list_payments(p_limite integer default 50)
returns table (
  occurred_at  timestamptz,
  email        text,
  plan         text,
  amount_cents bigint,
  currency     text,
  event_type   text,
  reference    text
)
language plpgsql
security definer
set search_path = public
as $fn_list_pay$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  return query
    select p.occurred_at, lower(coalesce(au.email, '(compte supprimé)')), p.plan,
           p.amount_cents, p.currency, p.event_type, p.paddle_transaction_id
    from public.subscription_payments p
    left join auth.users au on au.id = p.user_id
    order by p.occurred_at desc
    limit least(coalesce(p_limite, 50), 500);
end
$fn_list_pay$;

grant execute on function public.admin_list_payments(integer) to authenticated;

create or replace function public.admin_payment_stats()
returns table (
  encaisse_mois_cents  bigint,
  paiements_mois       integer,
  encaisse_total_cents bigint,
  paiements_total      integer,
  devises              text
)
language plpgsql
security definer
set search_path = public
stable
as $fn_pay_stats$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  return query
    select
      coalesce(sum(p.amount_cents) filter (
        where p.occurred_at >= date_trunc('month', now())), 0)::bigint,
      count(*) filter (where p.occurred_at >= date_trunc('month', now()))::int,
      coalesce(sum(p.amount_cents), 0)::bigint,
      count(*)::int,
      -- Les totaux n'ont de sens qu'en devise unique. On renvoie la liste des
      -- devises presentes : si elle en contient plusieurs, l'ecran doit se taire
      -- plutot que d'additionner des dollars avec des euros.
      coalesce(string_agg(distinct p.currency, ', '), 'USD')
    from public.subscription_payments p
    where p.amount_cents is not null;
end
$fn_pay_stats$;

grant execute on function public.admin_payment_stats() to authenticated;
