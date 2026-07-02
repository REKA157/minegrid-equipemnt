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
