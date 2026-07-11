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
