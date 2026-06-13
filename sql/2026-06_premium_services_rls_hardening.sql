-- =====================================================================
-- DURCISSEMENT RLS premium_services — fermeture de l'auto-activation payante
-- =====================================================================
-- Contexte (audit 2026-06) : la RLS historique de `premium_services`
-- (cf. archive/scripts/sql/supabase-schema.sql) exposait DEUX vecteurs de
-- contournement de paiement, identiques à la faille pro_clients :
--   • "Users can insert their own services"  -> INSERT WITH CHECK (user_id = auth.uid())
--       => le client pouvait insérer directement { status:'active' } SANS paiement ;
--   • "Users can update their own services"  -> UPDATE USING (user_id = auth.uid())
--       sans WITH CHECK => le client pouvait faire passer sa propre ligne
--       'pending' -> 'active'.
-- N'importe quel utilisateur connecté pouvait donc s'attribuer un service
-- premium/enterprise gratuit depuis la console (premium.ts:requestPremiumService).
--
-- Modèle retenu (cohérent avec sql/2026-06_pro_clients_rls_hardening.sql) :
-- l'ENTITLEMENT payant fait AUTORITÉ dans `pro_clients`, écrit UNIQUEMENT par le
-- webhook Stripe (service_role) après paiement vérifié. Sur `premium_services`, le
-- client ne peut JAMAIS écrire ni atteindre status='active'. On autorise seulement,
-- côté client :
--   - SELECT de ses propres lignes ;
--   - INSERT d'une DEMANDE en status='pending' (jamais 'active') ;
--   - UPDATE de ses lignes vers status='cancelled' uniquement (auto-annulation) ;
--   - DELETE de ses lignes (purge de compte, cf. deleteUserAccount).
-- Le passage 'pending' -> 'active' (et toute autre écriture) est réservé au
-- service_role, qui contourne la RLS. AUCUNE policy ne l'accorde à anon/authenticated.
--
-- Idempotent : exécutable plusieurs fois sans erreur. À appliquer dans le SQL Editor
-- Supabase (ou via migration) sur l'environnement cible.
-- =====================================================================

ALTER TABLE public.premium_services ENABLE ROW LEVEL SECURITY;

-- 0) Grants de base : les policies RLS ne s'appliquent qu'aux privilèges détenus.
--    anon n'a aucun droit ; authenticated reste borné par les policies ci-dessous.
REVOKE ALL ON public.premium_services FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.premium_services TO authenticated;

-- 1) Retirer TOUTES les anciennes policies permissives (noms historiques + génériques).
--    Les deux premières sont les vecteurs de contournement décrits ci-dessus.
DROP POLICY IF EXISTS "Users can view their own services" ON public.premium_services;
DROP POLICY IF EXISTS "Users can insert their own services" ON public.premium_services;
DROP POLICY IF EXISTS "Users can update their own services" ON public.premium_services;
DROP POLICY IF EXISTS "Users can delete their own services" ON public.premium_services;
DROP POLICY IF EXISTS "Users can view their own premium services" ON public.premium_services;
DROP POLICY IF EXISTS "Users can insert their own premium services" ON public.premium_services;
DROP POLICY IF EXISTS "Users can update their own premium services" ON public.premium_services;
DROP POLICY IF EXISTS "premium_services_select_own" ON public.premium_services;
DROP POLICY IF EXISTS "premium_services_insert_pending_own" ON public.premium_services;
DROP POLICY IF EXISTS "premium_services_cancel_own" ON public.premium_services;
DROP POLICY IF EXISTS "premium_services_delete_own" ON public.premium_services;

-- 2) SELECT : le propriétaire lit ses propres services.
CREATE POLICY "premium_services_select_own"
  ON public.premium_services
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) INSERT : le propriétaire ne peut créer qu'une DEMANDE en 'pending'.
--    => impossible de s'auto-attribuer un service 'active' (cœur du correctif).
CREATE POLICY "premium_services_insert_pending_own"
  ON public.premium_services
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- 4) UPDATE : le propriétaire ne peut que passer ses lignes en 'cancelled'
--    (auto-annulation). Le WITH CHECK refuse toute remise à 'active'.
CREATE POLICY "premium_services_cancel_own"
  ON public.premium_services
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- 5) DELETE : le propriétaire peut purger ses propres lignes (suppression de compte).
CREATE POLICY "premium_services_delete_own"
  ON public.premium_services
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- NB : l'activation réelle d'un service (passage à 'active' après paiement) est
-- réservée au service_role (webhook Stripe), qui contourne la RLS. C'est volontaire :
-- aucune policy ne l'accorde à anon/authenticated. Tant qu'aucun processus serveur
-- ne fait cette transition pour `premium_services`, l'entitlement payant doit être lu
-- via `pro_clients` (getMySubscription), seule source de vérité.

-- 6) Vérification (lecture) — liste les policies effectives.
-- SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies WHERE tablename = 'premium_services' ORDER BY policyname;
