-- =====================================================================
-- MINEGRID — DURCISSEMENT SÉCURITÉ À APPLIQUER EN PROD (audit Fable 5)
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor (coller tout -> Run), après backup.
-- 100% idempotent + gardé : ré-exécutable sans risque ; une table absente est
-- ignorée (message NOTICE), pas une erreur. Ferme : 2 P0 (commission, payment)
-- + P1 fraude/argent (inspection, transaction_cases, finance) + P2 (audit_logs).
-- N'affecte QUE la RLS/les droits ; le frontend ne fait que LIRE ces tables.
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
