-- =====================================================================
-- DEPLOY INVESTISSEUR — WIDGET "RENDEMENT RÉALISÉ VS ATTENDU"
-- Ajoute la base ATTENDUE (loyer cible / yield annuel) sur investments
-- pour la confronter au revenu RÉALISÉ (total_revenue_to_date existant).
-- Idempotent : ADD COLUMN IF NOT EXISTS + seed conditionnel.
-- RLS déjà en place (auth.uid() = created_by) via deploy_investisseur.sql.
-- =====================================================================

-- 1. COLONNES ATTENDU (rétro-compatibles)
ALTER TABLE investments ADD COLUMN IF NOT EXISTS target_monthly_revenue DECIMAL(12, 2);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS expected_yield_percent DECIMAL(6, 2);

COMMENT ON COLUMN investments.target_monthly_revenue IS 'Revenu/loyer mensuel ATTENDU (budget) pour cet actif, en MAD.';
COMMENT ON COLUMN investments.expected_yield_percent IS 'Rendement annuel cible en % du prix d''acquisition (fallback si target_monthly_revenue vide).';

-- 2. BACKFILL doux : donner une cible aux actifs existants qui n'en ont pas.
--    Cible par défaut = 5.5% annuel du prix d'acquisition (yield typique parc d'engins loués).
UPDATE investments
SET expected_yield_percent = 5.5
WHERE expected_yield_percent IS NULL
  AND target_monthly_revenue IS NULL
  AND acquisition_price IS NOT NULL;

-- 3. SEED compte de test (uid a7583ae2-53a3-4668-a4e0-0b12f9eca2f1)
--    Fixe des cibles réalistes + garantit AU MOINS UN actif franchement sous-performant.
DO $$
DECLARE
  v_user_id UUID := 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE NOTICE 'Compte de test % absent — skip seed rendement', v_user_id;
    RETURN;
  END IF;

  -- Filet : si le compte de test n'a aucun investissement (deploy_investisseur.sql
  -- a seedé le 1er user), on crée un petit portefeuille dédié au widget.
  IF NOT EXISTS (SELECT 1 FROM investments WHERE created_by = v_user_id) THEN
    -- Actif A : PERFORMANT (réalisé > attendu)
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type,
      current_market_value, expected_lifespan_years,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date,
      target_monthly_revenue, expected_yield_percent,
      status, exit_strategy, created_by
    ) VALUES (
      'INV-TEST-Y1', 'Pelle Caterpillar 336', 'Pelle hydraulique', 'Caterpillar', '336', 2021,
      CURRENT_DATE - INTERVAL '18 months', 1600000, 'Crédit-bail',
      1450000, 12,
      70000, 1350000, 60000,
      68000, NULL,
      'En location', 'Conserver', v_user_id
    );

    -- Actif B : SOUS-PERFORMANT SÉVÈRE (engin qui dort — réalisé très < attendu)
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
      current_market_value, expected_lifespan_years,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date,
      target_monthly_revenue, expected_yield_percent,
      status, exit_strategy, created_by, notes
    ) VALUES (
      'INV-TEST-Y2', 'Concasseur Metso LT120', 'Concasseur', 'Metso', 'LT120', 2020,
      CURRENT_DATE - INTERVAL '20 months', 2600000, 'Crédit', 41000,
      2300000, 12,
      15000, 240000, 95000,
      110000, NULL,
      'Détenu', 'Conserver', v_user_id,
      'Sous-loué : demande faible sur ce segment, capital qui dort.'
    );

    -- Actif C : PERFORMANT via yield cible (pas de loyer fixe ; réalisé > attendu)
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type,
      current_market_value, expected_lifespan_years,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date,
      target_monthly_revenue, expected_yield_percent,
      status, exit_strategy, created_by
    ) VALUES (
      'INV-TEST-Y3', 'Chargeuse Volvo L150H', 'Chargeuse', 'Volvo', 'L150H', 2019,
      CURRENT_DATE - INTERVAL '30 months', 1300000, 'Cash',
      1050000, 10,
      42000, 1050000, 70000,
      NULL, 6.0,
      'En location', 'Conserver', v_user_id
    );
  ELSE
    -- Le compte de test a déjà des actifs : on garantit qu'au moins l'un
    -- soit clairement sous-performant pour prouver l'alerte.
    UPDATE investments
    SET target_monthly_revenue = GREATEST(
          COALESCE(target_monthly_revenue, 0),
          ROUND((total_revenue_to_date / GREATEST(
            EXTRACT(EPOCH FROM (NOW() - acquisition_date)) / (3600*24*30), 1
          )) * 2.2)
        )
    WHERE created_by = v_user_id
      AND id = (
        SELECT id FROM investments
        WHERE created_by = v_user_id
          AND status NOT IN ('Cédé', 'Hors service')
          AND acquisition_date IS NOT NULL
          AND COALESCE(total_revenue_to_date, 0) > 0
        ORDER BY acquisition_date ASC
        LIMIT 1
      );
  END IF;

  RAISE NOTICE 'Seed rendement réalisé vs attendu OK pour user_id=%', v_user_id;
END $$;

-- =====================================================================
-- VÉRIFICATION
-- =====================================================================
DO $$
DECLARE
  v_with_target INT;
BEGIN
  SELECT COUNT(*) INTO v_with_target FROM investments
  WHERE target_monthly_revenue IS NOT NULL OR expected_yield_percent IS NOT NULL;
  RAISE NOTICE '✅ Rendement : % actif(s) avec base attendue renseignée', v_with_target;
END $$;