-- =====================================================================
-- DURCISSEMENT RLS pro_clients — fermeture du contournement de paiement
-- =====================================================================
-- Contexte (audit 2026-06) : la seule RLS de `pro_clients` autorisait
-- INSERT/UPDATE avec `auth.uid() = user_id`. Combinée à l'absence de webhook
-- Stripe, n'importe quel utilisateur connecté pouvait écrire lui-même une ligne
-- {subscription_status:'active'} et obtenir un abonnement Pro/Enterprise gratuit.
--
-- Correctif : seules les LECTURES restent autorisées au propriétaire. Toute
-- écriture (activation d'abonnement) est réservée au rôle `service_role`, utilisé
-- exclusivement par la fonction Edge `stripe-webhook` après vérification de la
-- signature Stripe.
--
-- Idempotent : exécutable plusieurs fois sans erreur. À appliquer dans le SQL
-- Editor Supabase (ou via migration) sur l'environnement cible.
-- =====================================================================

ALTER TABLE public.pro_clients ENABLE ROW LEVEL SECURITY;

-- 1) Retirer les anciennes policies d'écriture côté client (tous noms connus).
DROP POLICY IF EXISTS "Users can insert their own pro profile" ON public.pro_clients;
DROP POLICY IF EXISTS "Users can update their own pro profile" ON public.pro_clients;
DROP POLICY IF EXISTS "pro_clients_insert_own" ON public.pro_clients;
DROP POLICY IF EXISTS "pro_clients_update_own" ON public.pro_clients;

-- 2) Lecture : le propriétaire voit son propre abonnement (recréée proprement).
DROP POLICY IF EXISTS "Users can view their own pro profile" ON public.pro_clients;
CREATE POLICY "pro_clients_select_own"
  ON public.pro_clients
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) Écritures : réservées au service_role (webhook Stripe). Le rôle service_role
--    contourne la RLS par défaut ; on s'assure surtout qu'AUCUNE policy ne donne
--    INSERT/UPDATE/DELETE à anon/authenticated. On révoque aussi les grants directs.
REVOKE INSERT, UPDATE, DELETE ON public.pro_clients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pro_clients FROM authenticated;

-- 4) Vérification (lecture) — liste les policies effectives.
-- SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies WHERE tablename = 'pro_clients' ORDER BY policyname;
