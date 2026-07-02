-- =====================================================================
-- P3 — RLS machines : fin du hijack d'annonces
-- =====================================================================
-- AVANT : la seule policy du repo (archive/scripts/sql/fix-machines-rls-policies.sql)
-- était SELECT/INSERT/UPDATE/DELETE USING(true) — n'importe quel visiteur pouvait
-- modifier le prix, réattribuer `sellerid`, ou SUPPRIMER l'annonce d'un concurrent.
--
-- APRÈS :
--   - SELECT public (catalogue public assumé).
--   - INSERT réservé aux authentifiés ; un trigger FORCE la propriété = auth.uid()
--     (impossible d'usurper `sellerid`/`seller_id`) tout en laissant passer les imports
--     service_role/n8n (auth.uid() NULL -> valeurs fournies conservées).
--   - UPDATE / DELETE réservés au propriétaire réel (coalesce des 4 colonnes owner).
-- Idempotent.
-- =====================================================================

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- 1) Purge de TOUTES les policies existantes sur machines (dont les USING(true)).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'machines'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.machines', pol.policyname);
  END LOOP;
END $$;

-- 2) Trigger anti-usurpation : pour un utilisateur authentifié, la propriété de
--    l'annonce est TOUJOURS forcée à auth.uid() (le client ne peut pas mentir).
--    Les imports service_role (auth.uid() NULL) ne sont pas modifiés.
CREATE OR REPLACE FUNCTION public.machines_force_owner_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.sellerid := auth.uid();
    NEW.seller_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_machines_force_owner ON public.machines;
CREATE TRIGGER trg_machines_force_owner
  BEFORE INSERT ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.machines_force_owner_fn();

-- 3) Policies strictes.
CREATE POLICY machines_select_public ON public.machines
  FOR SELECT USING (true);

CREATE POLICY machines_insert_own ON public.machines
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND coalesce(sellerid, seller_id) = auth.uid()  -- garanti par le trigger ci-dessus
  );

CREATE POLICY machines_update_own ON public.machines
  FOR UPDATE TO authenticated
  USING (coalesce(seller_id, sellerid, user_id, owner_id) = auth.uid())
  WITH CHECK (coalesce(seller_id, sellerid, user_id, owner_id) = auth.uid());

CREATE POLICY machines_delete_own ON public.machines
  FOR DELETE TO authenticated
  USING (coalesce(seller_id, sellerid, user_id, owner_id) = auth.uid());

-- Note : les annonces catalogue importées (owner NULL) restent lisibles (SELECT public)
-- mais non modifiables par un utilisateur — c'est le comportement voulu.
