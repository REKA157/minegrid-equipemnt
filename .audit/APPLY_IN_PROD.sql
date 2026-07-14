-- =====================================================================
-- MINEGRID — DURCISSEMENT SÉCURITÉ + PERF + RGPD À APPLIQUER EN PROD (audit Fable 5)
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor (coller tout -> Run), après backup.
-- 100% idempotent + gardé. Ferme P0/P1 argent/fraude/revenus + index perf + quota IA
-- + RPC de suppression de compte RGPD. Ensuite : déployer les Edge Functions
--   supabase functions deploy ai-proxy
--   supabase functions deploy delete-account
-- Et créer un code promo (jamais dans le front) :
--   insert into public.promo_codes (code, subscription_type, duration_days, max_uses, expires_at)
--   values ('TON-CODE', 'enterprise', 30, 20, now() + interval '90 days');
-- =====================================================================


-- >>>>>>>>>>>>>>>>>>>> 20260702090400_p3_restrict_transaction_cases_update.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P3 — Restriction des UPDATE sur transaction_cases (colonnes sensibles)
-- =====================================================================
-- AVANT : policy UPDATE = can_access_transaction_case -> TOUT participant (même un
-- transporteur simplement invité) pouvait modifier N'IMPORTE QUELLE colonne :
-- total_amount, buyer_user_id, seller_user_id, status, machine_id...
--
-- APRÈS (défense en profondeur, 2 verrous) :
--   1) Privilèges colonne : seules title/notes/priority sont modifiables en direct
--      par `authenticated`. Les colonnes sensibles ne peuvent être changées que par
--      les RPC SECURITY DEFINER (advance_transaction_case_step, transitions P5...),
--      qui s'exécutent en tant que propriétaire de la table (hors RLS/grants).
--   2) Policy UPDATE restreinte aux PRINCIPAUX (vendeur/acheteur/admin d'org),
--      plus « tout participant ».
-- Vérifié : aucune écriture cliente directe `transaction_cases.update` (les
-- changements passent par RPC). Le parcours devis->dossier (INSERT) n'est pas touché.
-- Idempotent.
-- =====================================================================

-- 1) Verrou colonne : révoquer l'UPDATE global, ne (re)concéder que le sûr.
REVOKE UPDATE ON public.transaction_cases FROM authenticated;
GRANT UPDATE (title, notes, priority) ON public.transaction_cases TO authenticated;

-- 2) Policy UPDATE restreinte aux principaux.
DROP POLICY IF EXISTS transaction_cases_update ON public.transaction_cases;
CREATE POLICY transaction_cases_update ON public.transaction_cases
  FOR UPDATE TO authenticated
  USING (
    seller_user_id = auth.uid()
    OR buyer_user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.user_in_org_admin(organization_id, auth.uid()))
  )
  WITH CHECK (
    seller_user_id = auth.uid()
    OR buyer_user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.user_in_org_admin(organization_id, auth.uid()))
  );

-- >>>>>>>>>>>>>>>>>>>> 20260711170000_p8_lock_commission_records.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P8 — Verrouillage commission_records : fin des commissions forgées (P0)
-- =====================================================================
-- FAILLE (audit Fable 5, cluster escrow-paiement) : commission_records est une
-- table MONÉTAIRE (amount, status, beneficiary_id). Ses policies d'écriture
-- étaient OUVERTES à tout participant du dossier :
--   - commission_records_write  (INSERT, with check can_access_transaction_case)
--   - commission_records_update (UPDATE, using beneficiary OR can_access)
--   + GRANT INSERT, UPDATE ON commission_records TO authenticated
-- Conséquence : un acheteur/vendeur/participant pouvait INSÉRER une commission
-- avec un amount/beneficiary arbitraire, ou passer status='paid' — falsifiant un
-- versement affiché dans le cockpit. C'est EXACTEMENT la classe de faille corrigée
-- pour payment_records par P3 (20260702090300), mais jamais appliquée ici.
--
-- CORRECTIF (identique à P3) : commission_records n'est écrite QUE côté serveur
-- (service_role / RPC SECURITY DEFINER). Le client ne fait que LIRE (bénéficiaire
-- ou partie du dossier). On révoque toute écriture cliente.
--
-- Statements DIRECTS (aucun do $$) pour compat éditeur SQL Supabase. Idempotent.
-- Pré-requis : la table public.commission_records existe déjà (baseline
-- sql/transaction_platform_extended.sql, comme payment_records pour P3).
-- =====================================================================

alter table public.commission_records enable row level security;

-- 1) Retirer les policies d'écriture cliente.
drop policy if exists commission_records_write on public.commission_records;
drop policy if exists commission_records_update on public.commission_records;

-- 2) Retirer les privilèges d'écriture au rôle authenticated (service_role et les
--    fonctions SECURITY DEFINER ne sont pas affectés).
revoke insert, update, delete on public.commission_records from authenticated;
revoke insert, update, delete on public.commission_records from anon;

-- 3) Lecture conservée (bénéficiaire + parties du dossier), recréée pour idempotence.
drop policy if exists commission_records_access on public.commission_records;
create policy commission_records_access on public.commission_records
  for select to authenticated
  using (
    beneficiary_id = auth.uid()
    or public.can_access_transaction_case(transaction_case_id, auth.uid())
  );

grant select on public.commission_records to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 20260711180000_p9_lock_finance_scoring.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P9 — Verrouillage du scoring finance_applications (P1 : auto-scoring) — LATENT
-- =====================================================================
-- FAILLE (audit Fable 5, cluster finance) : la policy RLS d'UPDATE
-- (finance_apps_update_own_draft, sql/nextgen/0002) autorise le demandeur à
-- modifier N'IMPORTE QUELLE colonne tant que status ∈ (draft,submitted), dont
-- `score` et `partner_id` (colonnes SERVEUR) -> auto-scoring / choix de partenaire.
--
-- ÉTAT PROD (prod_rls_verification.sql, 2026-07-11) : la table finance_applications
-- N'EXISTE PAS en prod (couche finance nextgen non déployée — cf. absente du tableau
-- de vérif ; seule financing_requests, la variante transaction_platform, est là).
-- Cette migration est donc LATENTE : elle ne mord qu'au déploiement de la finance.
--
-- Pour être SÛRE à appliquer maintenant (no-op si table absente) ET correcte plus
-- tard, on garde par to_regclass. Délimiteur nommé $guard$ (pas de $$ ambigu,
-- aucun SELECT INTO) pour compat éditeur Supabase. Idempotent.
--
-- CORRECTIF : privilèges de COLONNE — UPDATE client limité aux colonnes non
-- sensibles ; score/partner_id réservés au service_role.
-- =====================================================================

do $guard$
begin
  if to_regclass('public.finance_applications') is null then
    raise notice 'finance_applications absente : migration p9 ignorée (couche finance non déployée)';
    return;
  end if;

  alter table public.finance_applications enable row level security;

  -- Retirer l'UPDATE « toutes colonnes » au client…
  revoke update on public.finance_applications from authenticated;
  revoke update on public.finance_applications from anon;

  -- …puis n'accorder l'UPDATE que sur les colonnes CLIENT (jamais score/partner_id).
  grant update (amount, currency, term_months, machine_id, dossier, status, updated_at)
    on public.finance_applications to authenticated;
end;
$guard$;

-- >>>>>>>>>>>>>>>>>>>> 20260711190000_p10_lock_inspection_reports.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P10 — Verrouillage inspection_reports : fin de « le vendeur écrit son inspection »
-- =====================================================================
-- FAILLE (audit Fable 5 — CONFIRMÉE en prod via prod_rls_verification.sql) : la table
-- inspection_reports porte des policies d'écriture ouvertes à tout participant du
-- dossier :
--   inspection_reports_write  (INSERT, mechanic_id=auth.uid() OR can_access_transaction_case)
--   inspection_reports_update (UPDATE, idem)
-- Le rapport d'inspection est l'artefact de CONFIANCE central. Permettre au VENDEUR
-- (qui a can_access_transaction_case sur le dossier de sa propre machine) d'insérer
-- ou d'éditer condition_score/summary = fabriquer une inspection favorable (fraude).
--
-- CONSTAT CODE : le frontend ne fait que LIRE inspection_reports
-- (src/utils/api/transactionPlatform.ts:234 .select ; src/nextgen/inspection/
--  inspectionService.ts:59 .select). Le widget mécanicien d'écriture est PLANIFIÉ
-- (non branché). Révoquer l'écriture cliente NE CASSE donc AUCUNE fonctionnalité :
-- le rapport n'est écrit que côté serveur (inspecteur certifié / service_role / RPC).
--
-- CORRECTIF : révoquer toute écriture cliente + supprimer les policies d'écriture
-- (les 2 variantes coexistantes en prod). Lecture conservée. Column-agnostic (opère
-- seulement sur RLS/grants), donc sûr malgré la collision de schéma. Idempotent.
-- =====================================================================

alter table public.inspection_reports enable row level security;

-- Retirer TOUTES les policies d'écriture cliente (variantes transaction_platform + nextgen).
drop policy if exists inspection_reports_write  on public.inspection_reports;
drop policy if exists inspection_reports_update on public.inspection_reports;
drop policy if exists inspection_rep_write      on public.inspection_reports;
drop policy if exists inspection_rep_update     on public.inspection_reports;

-- Retirer les privilèges d'écriture (service_role et SECURITY DEFINER non affectés).
revoke insert, update, delete on public.inspection_reports from authenticated;
revoke insert, update, delete on public.inspection_reports from anon;

-- Lecture conservée : les policies SELECT existantes (parties du dossier / rapport
-- certifié) restent en place ; on ré-affirme seulement le GRANT SELECT.
grant select on public.inspection_reports to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 20260711200000_p11_relock_payment_records_prod.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P11 — RE-verrouillage payment_records en PROD (P0 confirmé)
-- =====================================================================
-- CONSTAT PROD (prod_rls_verification.sql, 2026-07-11) : payment_records montre
-- `ecritures_client = DELETE,INSERT,UPDATE` pour le rôle authenticated + 5 policies.
-- Or la migration P3 (20260702090300) était censée révoquer ces écritures. Preuve
-- que la série de durcissement supabase/migrations/ (p2..p10) n'a PAS été appliquée
-- en prod — seule la baseline sql/transaction_platform_extended.sql l'a été (qui,
-- elle, OUVRE les écritures via payment_records_write/_update + GRANT).
--
-- IMPACT (P0) : un participant du dossier peut INSÉRER/mettre payment_records
-- status='released' -> faux « fonds libérés » affichés à l'acheteur dans le cockpit.
--
-- MÉCANISME DE VERROU : en Postgres, une écriture exige À LA FOIS un GRANT et une
-- policy passante. REVOKE des privilèges d'écriture = verrou DÉFINITIF, quel que
-- soit le nombre/nom des policies. On révoque + on drop les policies d'écriture
-- connues (idempotent). payment_records n'est alors écrite QUE par le pont escrow
-- SECURITY DEFINER / service_role. Le frontend ne fait que LIRE (vérifié).
-- =====================================================================

alter table public.payment_records enable row level security;

-- Verrou définitif : plus aucune écriture cliente possible (grant retiré).
revoke insert, update, delete on public.payment_records from authenticated;
revoke insert, update, delete on public.payment_records from anon;

-- Nettoyage des policies d'écriture ouvertes (baseline extended.sql).
drop policy if exists payment_records_write  on public.payment_records;
drop policy if exists payment_records_update on public.payment_records;

-- Lecture conservée (parties du dossier). Ré-affirmée pour idempotence.
drop policy if exists payment_records_access on public.payment_records;
create policy payment_records_access on public.payment_records
  for select to authenticated
  using (
    payer_id = auth.uid()
    or payee_id = auth.uid()
    or public.can_access_transaction_case(transaction_case_id, auth.uid())
  );

grant select on public.payment_records to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 20260711210000_p12_lock_audit_logs.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P12 — audit_logs : forcer l'auto-attribution (fin de la pollution actor_id NULL)
-- =====================================================================
-- FAILLE (audit Fable 5, F-006) : la policy INSERT audit_logs_insert_own accepte
-- `actor_id IS NULL OR actor_id = auth.uid()` -> un utilisateur authentifié peut
-- insérer des entrées d'audit ANONYMES (actor_id NULL) et polluer/brouiller le
-- journal. Le front ne fait que LIRE audit_logs (auditLogService.listByCase =
-- .select) -> forcer l'auto-attribution ne casse rien.
--
-- CORRECTIF : le client ne peut insérer une entrée qu'à SON nom (actor_id=auth.uid()).
-- Le serveur (service_role / triggers) reste libre d'écrire des évènements système
-- avec actor_id NULL (RLS non appliquée au service_role).
--
-- Gardée (to_regclass) + délimiteur nommé pour le bundle/éditeur Supabase. Idempotent.
-- =====================================================================

do $p12$
begin
  if to_regclass('public.audit_logs') is null then
    raise notice 'audit_logs absente : p12 ignorée'; return;
  end if;

  alter table public.audit_logs enable row level security;

  drop policy if exists audit_logs_insert_own on public.audit_logs;
  create policy audit_logs_insert_own on public.audit_logs
    for insert to authenticated
    with check (actor_id = auth.uid());   -- plus de actor_id NULL côté client
end;
$p12$;

-- >>>>>>>>>>>>>>>>>>>> 20260711220000_p13_stripe_idempotency.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 20260711230000_p14_lock_pro_clients.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P14 — Verrouillage pro_clients : fin de l'abonnement gratuit auto-octroyé (P1 REVENUS)
-- =====================================================================
-- FAILLE (audit Fable 5, abus) : le front écrit DIRECTEMENT dans pro_clients
-- {subscription_status:'active'} via un code promo (VITE_PROMO_CODE, lisible dans
-- le bundle JS -> découvrable) — cf. Dashboard.jsx / Register.tsx. Le verrou RLS
-- qui l'empêche vit UNIQUEMENT dans sql/2026-06_pro_clients_rls_hardening.sql,
-- ABSENT des migrations trackées -> non appliqué en prod (comme tout le durcissement).
-- Conséquence : n'importe quel utilisateur (ou toute personne trouvant le code promo)
-- peut s'octroyer un abonnement pro/premium/enterprise GRATUIT.
--
-- CORRECTIF (port fidèle du hardening 2026-06) : la lecture reste au propriétaire ;
-- toute ÉCRITURE (activation d'abonnement) est réservée au service_role (webhook
-- Stripe, après vérif de signature). On révoque les grants d'écriture client.
--
-- Gardée (to_regclass) + délimiteur nommé pour le bundle/éditeur Supabase. Idempotent.
-- NB : ceci CASSE volontairement le chemin promo côté client (la faille). Un code
-- promo légitime doit être re-validé CÔTÉ SERVEUR (edge function + table promo_codes)
-- qui active via service_role — voir .audit/REMAINING_WORK.md.
-- =====================================================================

do $p14$
begin
  if to_regclass('public.pro_clients') is null then
    raise notice 'pro_clients absente : p14 ignorée'; return;
  end if;

  alter table public.pro_clients enable row level security;

  -- Retirer toutes les policies d'écriture cliente connues.
  drop policy if exists "Users can insert their own pro profile" on public.pro_clients;
  drop policy if exists "Users can update their own pro profile" on public.pro_clients;
  drop policy if exists "pro_clients_insert_own" on public.pro_clients;
  drop policy if exists "pro_clients_update_own" on public.pro_clients;

  -- Lecture : le propriétaire voit son propre abonnement (recréée proprement).
  drop policy if exists "Users can view their own pro profile" on public.pro_clients;
  drop policy if exists "pro_clients_select_own" on public.pro_clients;
  create policy "pro_clients_select_own" on public.pro_clients
    for select to authenticated using (auth.uid() = user_id);

  -- Écritures réservées au service_role : on révoque tout droit d'écriture client.
  revoke insert, update, delete on public.pro_clients from anon;
  revoke insert, update, delete on public.pro_clients from authenticated;
end;
$p14$;

-- >>>>>>>>>>>>>>>>>>>> 20260711240000_p15_promo_codes.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P15 — Codes promo SÉCURISÉS (remplace le code promo côté client troué)
-- =====================================================================
-- AVANT : le front comparait un code lisible dans le bundle (VITE_PROMO_CODE) puis
-- écrivait lui-même pro_clients='active' -> code public + activation falsifiable +
-- sans limite = abonnement entreprise gratuit pour tous.
--
-- APRÈS : les codes vivent CÔTÉ SERVEUR (table promo_codes, AUCUN accès client ->
-- pas d'énumération). Le client ne peut que SOUMETTRE un code via la RPC
-- redeem_promo_code() (SECURITY DEFINER) qui valide (actif, non expiré, quota non
-- atteint, pas déjà utilisé par ce compte) et active l'abonnement en tant que
-- serveur (contourne le verrou p14, exactement comme le webhook Stripe). Limité :
-- max_uses, expires_at, un usage par utilisateur (unique).
-- Statements directs + délimiteur $fn$. Idempotent.
-- =====================================================================

create table if not exists public.promo_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  subscription_type text not null default 'enterprise',
  duration_days     int  not null default 30,
  max_uses          int  not null default 1,
  uses_count        int  not null default 0,
  expires_at        timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
-- Unicité insensible à la casse.
create unique index if not exists promo_codes_code_key on public.promo_codes (lower(code));

create table if not exists public.promo_redemptions (
  id             uuid primary key default gen_random_uuid(),
  promo_code_id  uuid not null references public.promo_codes(id) on delete cascade,
  user_id        uuid not null,
  redeemed_at    timestamptz not null default now(),
  unique (promo_code_id, user_id)   -- un même compte ne redéem pas 2× le même code
);

-- Aucun accès client direct : tout passe par la RPC.
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_codes from anon, authenticated;
revoke all on public.promo_redemptions from anon, authenticated;

-- RPC de rédemption : valide + active (SECURITY DEFINER = écrit pro_clients malgré p14).
create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_promo public.promo_codes%rowtype;
  v_end   date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  -- Code valide ? (verrou de ligne pour éviter la course sur uses_count)
  select * into v_promo from public.promo_codes
  where lower(code) = lower(btrim(p_code))
    and active = true
    and (expires_at is null or expires_at > now())
    and uses_count < max_uses
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Code promo invalide, expiré ou épuisé');
  end if;

  if exists (select 1 from public.promo_redemptions r
             where r.promo_code_id = v_promo.id and r.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'Code déjà utilisé sur ce compte');
  end if;

  insert into public.promo_redemptions (promo_code_id, user_id) values (v_promo.id, v_uid);
  update public.promo_codes set uses_count = uses_count + 1 where id = v_promo.id;

  v_end := (now() + make_interval(days => v_promo.duration_days))::date;
  insert into public.pro_clients (user_id, subscription_type, subscription_status,
                                  subscription_start, subscription_end, payment_method, updated_at)
  values (v_uid, v_promo.subscription_type, 'active', now()::date, v_end, 'promo_code', now())
  on conflict (user_id) do update
    set subscription_type   = excluded.subscription_type,
        subscription_status = 'active',
        subscription_start  = excluded.subscription_start,
        subscription_end    = excluded.subscription_end,
        payment_method      = 'promo_code',
        updated_at          = now();

  return jsonb_build_object('ok', true, 'subscription_type', v_promo.subscription_type,
                            'subscription_end', v_end);
end;
$fn$;

grant execute on function public.redeem_promo_code(text) to authenticated;

-- Pour créer un code (à faire par l'admin, jamais dans le front) :
--   insert into public.promo_codes (code, subscription_type, duration_days, max_uses, expires_at)
--   values ('MON-CODE-SECRET', 'enterprise', 30, 20, now() + interval '90 days');

-- >>>>>>>>>>>>>>>>>>>> 20260711250000_p16_perf_indexes.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P16 — Index de performance sur les requêtes les plus fréquentes (audit Fable 5)
-- =====================================================================
-- FAIT : aucun index versionné sur machines/leads/messages ; or l'app trie/filtre
-- constamment sur created_at (accueil, catalogue, pipeline), sellerid/seller_id
-- (vitrine, « mes annonces »), category (secteurs), et messages.seller_id/receiver_id.
-- Sans index -> seq scans sur les tables les plus chaudes = lenteur à la montée en charge.
--
-- Création GARDÉE (bloc unique $idx$, délimiteur nommé pour compat éditeur Supabase) :
-- chaque index n'est créé que si la table ET la colonne existent -> aucun échec si un
-- schéma diffère. Idempotent (create index if not exists).
--
-- NB : sur une TRÈS grosse table, préférer `CREATE INDEX CONCURRENTLY` (hors
-- transaction, pas de verrou) exécuté à la main. Ici, volumes actuels modestes :
-- la création est quasi instantanée.
-- =====================================================================

do $idx$
declare
  r record;
begin
  for r in
    select * from (values
      ('machines', 'created_at', 'idx_machines_created_at', ' desc'),
      ('machines', 'sellerid',   'idx_machines_sellerid',   ''),
      ('machines', 'seller_id',  'idx_machines_seller_id',  ''),
      ('machines', 'category',   'idx_machines_category',   ''),
      ('leads',    'created_at',  'idx_leads_created_at',    ' desc'),
      ('messages', 'seller_id',   'idx_messages_seller_id',  ''),
      ('messages', 'receiver_id', 'idx_messages_receiver_id',''),
      ('messages', 'sellerid',    'idx_messages_sellerid',   '')
    ) as t(tbl, col, idxname, opt)
  loop
    if to_regclass('public.' || r.tbl) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tbl and column_name = r.col
       ) then
      execute format('create index if not exists %I on public.%I (%I%s)',
                     r.idxname, r.tbl, r.col, r.opt);
    end if;
  end loop;
end;
$idx$;

-- >>>>>>>>>>>>>>>>>>>> 20260711260000_p17_ai_usage_quota.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P17 — Quota IA par société (anti-abus des crédits, audit Fable 5)
-- =====================================================================
-- FAILLE : l'Edge Function ai-proxy appelle le fournisseur LLM avec la clé de la
-- SOCIÉTÉ sans aucun quota -> un membre (ou un JWT volé) peut boucler des requêtes
-- et brûler le budget/les crédits IA de l'organisation (abus financier + DoS budget).
--
-- CORRECTIF : compteur quotidien par org + RPC atomique bump_ai_usage() appelée
-- par ai-proxy (service_role) AVANT chaque appel fournisseur. Au-delà du plafond,
-- l'appel est refusé (429). Table réservée au service_role (aucun accès client).
-- Statements directs + délimiteur $fn$. Idempotent.
-- =====================================================================

create table if not exists public.ai_usage_daily (
  organization_id uuid not null,
  usage_date      date not null default current_date,
  request_count   int  not null default 0,
  primary key (organization_id, usage_date)
);

alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from anon, authenticated;

-- Incrémente le compteur du jour et renvoie true si SOUS le plafond, false sinon.
-- Atomique (insert ... on conflict do update). SECURITY DEFINER : appelée par le
-- service_role de l'Edge Function.
create or replace function public.bump_ai_usage(p_org uuid, p_daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count int;
begin
  if p_org is null then
    return false;
  end if;

  insert into public.ai_usage_daily (organization_id, usage_date, request_count)
  values (p_org, current_date, 1)
  on conflict (organization_id, usage_date)
  do update set request_count = public.ai_usage_daily.request_count + 1
  returning request_count into v_count;

  return v_count <= greatest(1, p_daily_limit);
end;
$fn$;

-- Par défaut PostgreSQL accorde EXECUTE à PUBLIC : on le retire pour réserver la
-- fonction au service_role (l'Edge Function ai-proxy). Aucun client ne peut la
-- boucler pour gonfler le compteur d'une autre société.
revoke execute on function public.bump_ai_usage(uuid, int) from public;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;

-- >>>>>>>>>>>>>>>>>>>> 20260711270000_p18_delete_my_account.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- P18 — Suppression de compte RGPD (droit à l'effacement) — partie données
-- =====================================================================
-- FAILLE : les deux deleteUserAccount() côté client appelaient auth.admin.deleteUser
-- avec la clé ANON (403, inopérant) et n'étaient même pas câblés -> AUCUN parcours
-- de suppression de compte ne fonctionnait, et aucune donnée liée n'était purgée.
--
-- CORRECTIF (partie SQL) : RPC delete_my_account() SECURITY DEFINER qui efface les
-- lignes appartenant à l'APPELANT (auth.uid()) dans toutes les tables user-scopées
-- (boucle GARDÉE : ne touche une table/colonne que si elle existe). L'Edge Function
-- delete-account appelle cette RPC (avec le JWT du user), puis supprime l'utilisateur
-- auth via service_role (ce qui cascade les tables FK-liées).
-- Délimiteur $fn$, idempotent.
-- =====================================================================

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid     uuid := auth.uid();
  r         record;
  v_n       int;
  v_deleted int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  for r in
    select * from (values
      ('machines', 'sellerid'), ('machines', 'seller_id'),
      ('leads', 'seller_id'), ('leads', 'assigned_to_user_id'),
      ('messages', 'sellerid'), ('messages', 'seller_id'),
      ('documents', 'user_id'),
      ('planning_events', 'user_id'),
      ('devis', 'user_id'),
      ('vitrines', 'user_id'),
      ('pro_clients', 'user_id'),
      ('promo_redemptions', 'user_id'),
      ('member_sessions', 'user_id'),
      ('organization_member_scopes', 'user_id'),
      ('organization_members', 'user_id'),
      ('enterprise_dashboard_configs', 'user_id'),
      ('quote_requests', 'buyer_user_id'), ('quote_requests', 'seller_id')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || r.tbl) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tbl and column_name = r.col
       ) then
      execute format('delete from public.%I where %I = $1', r.tbl, r.col) using v_uid;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted + v_n;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rows_deleted', v_deleted);
end;
$fn$;

grant execute on function public.delete_my_account() to authenticated;
