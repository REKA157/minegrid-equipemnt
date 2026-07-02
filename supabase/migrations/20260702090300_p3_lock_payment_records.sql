-- =====================================================================
-- P3 — Verrouillage payment_records : fin des faux « fonds séquestrés/libérés »
-- =====================================================================
-- AVANT : INSERT/UPDATE autorisés à tout participant du dossier (policy can_access +
-- GRANT INSERT/UPDATE to authenticated) -> un vendeur pouvait poser status='released'
-- pour faire croire à l'acheteur, dans le cockpit, que les fonds étaient libérés.
--
-- APRÈS : payment_records n'est écrit QUE par le pont escrow côté serveur
-- (trigger/SECURITY DEFINER alimenté par le webhook PSP signé). Le client ne fait
-- que LIRE (vérifié : src/utils/api/transactionPlatform.ts ne fait que SELECT).
-- On révoque donc toute écriture cliente. La lecture (participants) est conservée.
-- Idempotent.
-- =====================================================================

-- Retirer les policies d'écriture cliente.
DROP POLICY IF EXISTS payment_records_write ON public.payment_records;
DROP POLICY IF EXISTS payment_records_update ON public.payment_records;

-- Retirer les privilèges d'écriture au rôle authenticated (le service_role et les
-- fonctions SECURITY DEFINER du pont escrow ne sont pas affectés).
REVOKE INSERT, UPDATE, DELETE ON public.payment_records FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_records FROM anon;

-- La policy de lecture (payment_records_access) et le GRANT SELECT restent en place.
-- (Re-affirmés ici pour idempotence si absents.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_records' AND policyname='payment_records_access'
  ) THEN
    CREATE POLICY payment_records_access ON public.payment_records
      FOR SELECT TO authenticated
      USING (
        payer_id = auth.uid() OR payee_id = auth.uid()
        OR public.can_access_transaction_case(transaction_case_id, auth.uid())
      );
  END IF;
END $$;

GRANT SELECT ON public.payment_records TO authenticated;
