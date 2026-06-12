-- =====================================================================
-- DEPLOY INVESTISSEUR — SCHÉMA MIGRATION-SAFE
-- 2 tables : investments, investment_opportunities
-- + RLS strict (auth.uid() = created_by)
-- + Triggers updated_at + auto-calculs ROI / paybacks
-- + Index de performance
-- + Données de test idempotentes
-- =====================================================================

CREATE OR REPLACE FUNCTION investisseur_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. INVESTMENTS (Portefeuille actuel)
-- =====================================================================
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE investments ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS equipment_label TEXT NOT NULL DEFAULT '';
ALTER TABLE investments ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IN (
    'Pelle hydraulique', 'Bulldozer', 'Chargeuse', 'Camion-benne',
    'Concasseur', 'Foreuse', 'Tombereau', 'Niveleuse',
    'Compacteur', 'Grue', 'Convoyeur', 'Autre engin'
  ));
ALTER TABLE investments ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS acquisition_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS acquisition_price DECIMAL(14, 2);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS financing_type TEXT DEFAULT 'Cash'
  CHECK (financing_type IN ('Cash', 'Crédit', 'Crédit-bail', 'LOA', 'Mixte'));
ALTER TABLE investments ADD COLUMN IF NOT EXISTS monthly_financing_cost DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS current_market_value DECIMAL(14, 2);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS expected_lifespan_years INTEGER DEFAULT 8;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS residual_value DECIMAL(14, 2);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS current_revenue_monthly DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS total_revenue_to_date DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS maintenance_cost_to_date DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS location_count INTEGER DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Détenu'
  CHECK (status IN ('Détenu', 'En location', 'En maintenance', 'En cession', 'Cédé', 'Hors service'));
ALTER TABLE investments ADD COLUMN IF NOT EXISTS exit_strategy TEXT DEFAULT 'Conserver'
  CHECK (exit_strategy IN ('Conserver', 'Revendre court terme', 'Revendre moyen terme', 'Démanteler / Pièces'));
ALTER TABLE investments ADD COLUMN IF NOT EXISTS target_exit_date DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS target_exit_price DECIMAL(14, 2);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE investments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_investments_created_by ON investments(created_by);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);
CREATE INDEX IF NOT EXISTS idx_investments_category ON investments(category);
CREATE INDEX IF NOT EXISTS idx_investments_acquisition_date ON investments(acquisition_date);

DROP TRIGGER IF EXISTS trg_investments_updated_at ON investments;
CREATE TRIGGER trg_investments_updated_at
  BEFORE UPDATE ON investments
  FOR EACH ROW EXECUTE FUNCTION investisseur_set_updated_at();

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS investments_select_own ON investments;
CREATE POLICY investments_select_own ON investments FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS investments_insert_own ON investments;
CREATE POLICY investments_insert_own ON investments FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS investments_update_own ON investments;
CREATE POLICY investments_update_own ON investments FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS investments_delete_own ON investments;
CREATE POLICY investments_delete_own ON investments FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- 2. INVESTMENT_OPPORTUNITIES (Pipeline d'achat / opportunités étudiées)
-- =====================================================================
CREATE TABLE IF NOT EXISTS investment_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS equipment_label TEXT NOT NULL DEFAULT '';
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Marché secondaire'
  CHECK (source IN ('Annonce Minegrid', 'Marché secondaire', 'Vente directe', 'Encan / Enchères', 'Concessionnaire', 'Reprise client', 'Autre'));
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS asking_price DECIMAL(14, 2);
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS estimated_market_value DECIMAL(14, 2);
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS estimated_acquisition_costs DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS expected_monthly_revenue DECIMAL(12, 2);
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS expected_monthly_costs DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS expected_holding_years DECIMAL(4, 1) DEFAULT 5;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS expected_resale_value DECIMAL(14, 2);
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS expected_roi_percent DECIMAL(6, 2);
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS payback_months INTEGER;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 5
  CHECK (risk_score BETWEEN 1 AND 10);
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS risk_factors TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS recommendation TEXT DEFAULT 'À étudier'
  CHECK (recommendation IN ('Acheter', 'Étudier', 'Suivre', 'Passer', 'À étudier'));
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active'
  CHECK (status IN ('Active', 'En négociation', 'Achetée', 'Refusée', 'Expirée', 'Convertie'));
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS converted_investment_id UUID REFERENCES investments(id) ON DELETE SET NULL;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE investment_opportunities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_opportunities_created_by ON investment_opportunities(created_by);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON investment_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_recommendation ON investment_opportunities(recommendation);
CREATE INDEX IF NOT EXISTS idx_opportunities_expiry ON investment_opportunities(expiry_date);
CREATE INDEX IF NOT EXISTS idx_opportunities_roi ON investment_opportunities(expected_roi_percent DESC);

DROP TRIGGER IF EXISTS trg_opportunities_updated_at ON investment_opportunities;
CREATE TRIGGER trg_opportunities_updated_at
  BEFORE UPDATE ON investment_opportunities
  FOR EACH ROW EXECUTE FUNCTION investisseur_set_updated_at();

-- Trigger : auto-calcul ROI et payback si données suffisantes
CREATE OR REPLACE FUNCTION investisseur_compute_opportunity_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_total_invest DECIMAL;
  v_monthly_net DECIMAL;
  v_total_revenue DECIMAL;
  v_total_costs DECIMAL;
  v_total_gain DECIMAL;
BEGIN
  v_total_invest := COALESCE(NEW.asking_price, 0) + COALESCE(NEW.estimated_acquisition_costs, 0);
  v_monthly_net := COALESCE(NEW.expected_monthly_revenue, 0) - COALESCE(NEW.expected_monthly_costs, 0);

  -- Payback : nb mois pour récupérer l'investissement (sans valeur résiduelle)
  IF v_monthly_net > 0 AND v_total_invest > 0 THEN
    NEW.payback_months := CEIL(v_total_invest / v_monthly_net)::INTEGER;
  END IF;

  -- ROI total sur la durée de détention : ((revenus + revente) - investissement) / investissement
  IF v_total_invest > 0 AND NEW.expected_holding_years IS NOT NULL THEN
    v_total_revenue := v_monthly_net * NEW.expected_holding_years * 12;
    v_total_costs := v_total_invest;
    v_total_gain := v_total_revenue + COALESCE(NEW.expected_resale_value, 0) - v_total_costs;
    -- ROI annualisé approximé
    NEW.expected_roi_percent := ROUND(((v_total_gain / v_total_costs) / NEW.expected_holding_years * 100)::numeric, 2);
  END IF;

  -- Auto-référence si vide
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := 'OP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(NEW.id::TEXT, 1, 6);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opportunities_compute ON investment_opportunities;
CREATE TRIGGER trg_opportunities_compute
  BEFORE INSERT OR UPDATE ON investment_opportunities
  FOR EACH ROW EXECUTE FUNCTION investisseur_compute_opportunity_metrics();

ALTER TABLE investment_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opportunities_select_own ON investment_opportunities;
CREATE POLICY opportunities_select_own ON investment_opportunities FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS opportunities_insert_own ON investment_opportunities;
CREATE POLICY opportunities_insert_own ON investment_opportunities FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS opportunities_update_own ON investment_opportunities;
CREATE POLICY opportunities_update_own ON investment_opportunities FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS opportunities_delete_own ON investment_opportunities;
CREATE POLICY opportunities_delete_own ON investment_opportunities FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- DONNÉES DE TEST IDEMPOTENTES
-- =====================================================================
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Aucun user — skip insertion test data investisseur';
    RETURN;
  END IF;

  -- INVESTMENTS (portefeuille actuel)
  IF NOT EXISTS (SELECT 1 FROM investments WHERE created_by = v_user_id AND equipment_label = 'Pelle Caterpillar 320D' AND year = 2018) THEN
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year, serial_number,
      acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
      current_market_value, expected_lifespan_years, residual_value,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date, location_count,
      status, exit_strategy, created_by
    )
    VALUES (
      'INV-2024-001', 'Pelle Caterpillar 320D', 'Pelle hydraulique', 'Caterpillar', '320D', 2018, 'CAT320D-A0451',
      CURRENT_DATE - INTERVAL '24 months', 1100000, 'Crédit-bail', 18500,
      850000, 10, 250000,
      45000, 980000, 87000, 12,
      'En location', 'Conserver', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investments WHERE created_by = v_user_id AND equipment_label = 'Bulldozer Komatsu D65' AND year = 2020) THEN
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
      current_market_value, expected_lifespan_years, residual_value,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date, location_count,
      status, exit_strategy, created_by
    )
    VALUES (
      'INV-2024-002', 'Bulldozer Komatsu D65', 'Bulldozer', 'Komatsu', 'D65PX-18', 2020,
      CURRENT_DATE - INTERVAL '14 months', 1450000, 'Crédit', 23410,
      1280000, 12, 350000,
      62000, 720000, 45000, 8,
      'Détenu', 'Conserver', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investments WHERE created_by = v_user_id AND equipment_label = 'Camion-benne Mercedes Arocs') THEN
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
      current_market_value, expected_lifespan_years, residual_value,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date, location_count,
      status, exit_strategy, target_exit_date, target_exit_price, created_by
    )
    VALUES (
      'INV-2024-003', 'Camion-benne Mercedes Arocs', 'Camion-benne', 'Mercedes-Benz', 'Arocs 4148', 2017,
      CURRENT_DATE - INTERVAL '36 months', 980000, 'Cash', 0,
      620000, 10, 180000,
      32000, 1180000, 142000, 18,
      'En location', 'Revendre moyen terme', CURRENT_DATE + INTERVAL '8 months', 580000, v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investments WHERE created_by = v_user_id AND equipment_label = 'Chargeuse Volvo L120H' AND status = 'Cédé') THEN
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type,
      current_market_value, expected_lifespan_years,
      total_revenue_to_date, maintenance_cost_to_date, location_count,
      status, exit_strategy, target_exit_date, target_exit_price, created_by, notes
    )
    VALUES (
      'INV-2023-008', 'Chargeuse Volvo L120H', 'Chargeuse', 'Volvo', 'L120H', 2016,
      CURRENT_DATE - INTERVAL '38 months', 850000, 'Cash',
      450000, 10,
      890000, 95000, 22,
      'Cédé', 'Revendre court terme', CURRENT_DATE - INTERVAL '4 months', 510000, v_user_id,
      'Cédée à BTP Atlas SARL pour 510k MAD'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investments WHERE created_by = v_user_id AND equipment_label = 'Concasseur Sandvik QJ241') THEN
    INSERT INTO investments (
      reference, equipment_label, category, brand, model, year,
      acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
      current_market_value, expected_lifespan_years,
      current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date, location_count,
      status, exit_strategy, created_by
    )
    VALUES (
      'INV-2025-001', 'Concasseur Sandvik QJ241', 'Concasseur', 'Sandvik', 'QJ241', 2022,
      CURRENT_DATE - INTERVAL '6 months', 2350000, 'Crédit-bail', 38200,
      2150000, 12,
      120000, 720000, 28000, 3,
      'En location', 'Conserver', v_user_id
    );
  END IF;

  -- OPPORTUNITIES (pipeline d'achat)
  IF NOT EXISTS (SELECT 1 FROM investment_opportunities WHERE created_by = v_user_id AND equipment_label = 'Pelle Komatsu PC290LC' AND source = 'Marché secondaire') THEN
    INSERT INTO investment_opportunities (
      equipment_label, category, brand, model, year, source,
      asking_price, estimated_market_value, estimated_acquisition_costs,
      expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
      expected_resale_value, risk_score, risk_factors, recommendation, status,
      contact_name, contact_phone, expiry_date, notes, created_by
    )
    VALUES (
      'Pelle Komatsu PC290LC', 'Pelle hydraulique', 'Komatsu', 'PC290LC-11', 2021, 'Marché secondaire',
      980000, 1050000, 35000,
      48000, 12000, 6,
      520000, 4, 'État correct, 4500h. Marché demande forte. Prévoir révision moteur < 6 mois.',
      'Acheter', 'En négociation',
      'Ahmed Berrada', '+212 6 12 33 44 55', CURRENT_DATE + INTERVAL '12 days',
      'Inspection technique réalisée. Vendeur ouvert à négociation -5%.', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investment_opportunities WHERE created_by = v_user_id AND equipment_label = 'Lot 2 Camions-bennes Renault Kerax') THEN
    INSERT INTO investment_opportunities (
      equipment_label, category, brand, model, year, source,
      asking_price, estimated_market_value, estimated_acquisition_costs,
      expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
      expected_resale_value, risk_score, risk_factors, recommendation, status,
      contact_name, contact_phone, expiry_date, created_by
    )
    VALUES (
      'Lot 2 Camions-bennes Renault Kerax', 'Camion-benne', 'Renault', 'Kerax 380', 2015, 'Encan / Enchères',
      640000, 720000, 25000,
      55000, 18000, 4,
      280000, 7, 'Modèle âgé, électronique vieillissante. Pneus à changer immédiatement. Risque pénurie pièces détachées.',
      'Étudier', 'Active',
      'BCM Auctions', '+212 522 99 00 11', CURRENT_DATE + INTERVAL '5 days', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investment_opportunities WHERE created_by = v_user_id AND equipment_label = 'Foreuse Atlas Copco SmartROC D65') THEN
    INSERT INTO investment_opportunities (
      equipment_label, category, brand, model, year, source,
      asking_price, estimated_market_value, estimated_acquisition_costs,
      expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
      expected_resale_value, risk_score, risk_factors, recommendation, status,
      contact_name, contact_phone, expiry_date, notes, created_by
    )
    VALUES (
      'Foreuse Atlas Copco SmartROC D65', 'Foreuse', 'Epiroc', 'SmartROC D65', 2023, 'Concessionnaire',
      4200000, 4400000, 80000,
      180000, 35000, 8,
      2100000, 3, 'Engin neuf-récent, technologie de pointe. Marché niche mais marges élevées. Demande secteur minier OCP/Managem en hausse.',
      'Acheter', 'Active',
      'Atlas Copco Maroc', '+212 522 67 80 90', CURRENT_DATE + INTERVAL '20 days',
      'Garantie constructeur 2 ans. Formation incluse.', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investment_opportunities WHERE created_by = v_user_id AND equipment_label = 'Niveleuse CAT 140K') THEN
    INSERT INTO investment_opportunities (
      equipment_label, category, brand, model, year, source,
      asking_price, estimated_market_value, estimated_acquisition_costs,
      expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
      expected_resale_value, risk_score, risk_factors, recommendation, status,
      contact_name, expiry_date, created_by
    )
    VALUES (
      'Niveleuse CAT 140K', 'Niveleuse', 'Caterpillar', '140K', 2014, 'Vente directe',
      720000, 680000, 15000,
      28000, 8000, 5,
      280000, 8, 'Engin sur-évalué par vendeur (10% au-dessus marché). Heures importantes (12000h). Maintenance lourde imminente.',
      'Passer', 'Refusée',
      'Particulier - Khaled', CURRENT_DATE - INTERVAL '2 days', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investment_opportunities WHERE created_by = v_user_id AND equipment_label = 'Tombereau articulé Bell B30E') THEN
    INSERT INTO investment_opportunities (
      equipment_label, category, brand, model, year, source,
      asking_price, estimated_market_value, estimated_acquisition_costs,
      expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
      expected_resale_value, risk_score, risk_factors, recommendation, status,
      contact_name, contact_phone, expiry_date, created_by
    )
    VALUES (
      'Tombereau articulé Bell B30E', 'Tombereau', 'Bell', 'B30E', 2019, 'Annonce Minegrid',
      1850000, 1950000, 40000,
      85000, 22000, 6,
      750000, 5, 'Bon état général, 6800h. Marque moins répandue → attention disponibilité pièces.',
      'À étudier', 'Active',
      'Mining Solutions Maroc', '+212 5 39 12 34 56', CURRENT_DATE + INTERVAL '30 days', v_user_id
    );
  END IF;

  RAISE NOTICE 'Données de test investisseur créées/mises à jour pour user_id=%', v_user_id;
END $$;

-- =====================================================================
-- VÉRIFICATION FINALE
-- =====================================================================
DO $$
DECLARE
  v_investments INT;
  v_opportunities INT;
BEGIN
  SELECT COUNT(*) INTO v_investments FROM investments;
  SELECT COUNT(*) INTO v_opportunities FROM investment_opportunities;
  RAISE NOTICE '✅ Investisseur déployé : % investissements, % opportunités',
    v_investments, v_opportunities;
END $$;
