-- =====================================================================
-- P3 — RLS rentals / interventions / rental_invoices : fin de la fuite inter-clients
-- =====================================================================
-- AVANT : policy SELECT `USING (auth.role() = 'authenticated')` -> TOUT utilisateur
-- connecté lisait les locations, montants, clients et factures de TOUS les loueurs
-- (fuite RGPD + renseignement concurrentiel). L'isolation n'était faite que côté API.
--
-- APRÈS : SELECT restreint au propriétaire (created_by = auth.uid()). Les policies
-- INSERT/UPDATE/DELETE étaient déjà « own » ; on ne touche qu'au SELECT.
-- Idempotent. NB : on DROP aussi la policy `_select_own` avant de la recréer, et on
-- supprime toute policy large résiduelle (les policies RLS se combinent en OR : une
-- seule policy large annulerait l'isolation).
-- =====================================================================

-- rentals
DROP POLICY IF EXISTS rentals_select_auth ON public.rentals;
DROP POLICY IF EXISTS rentals_select_own ON public.rentals;
CREATE POLICY rentals_select_own ON public.rentals
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- interventions (table partagée mécanicien/loueur — scope created_by valable pour les 2)
DROP POLICY IF EXISTS interventions_select_auth ON public.interventions;
DROP POLICY IF EXISTS interventions_select_own ON public.interventions;
CREATE POLICY interventions_select_own ON public.interventions
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- rental_invoices
DROP POLICY IF EXISTS rental_invoices_select_auth ON public.rental_invoices;
DROP POLICY IF EXISTS rental_invoices_select_own ON public.rental_invoices;
CREATE POLICY rental_invoices_select_own ON public.rental_invoices
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());
