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
