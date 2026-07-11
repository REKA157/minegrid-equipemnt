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
