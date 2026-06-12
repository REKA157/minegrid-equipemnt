-- =====================================================================
-- DEPLOY COURTIER (Crédit + Assurance) — SCHÉMA MIGRATION-SAFE
-- 3 tables : broker_clients, credit_applications, insurance_policies
-- + RLS strict (auth.uid() = created_by)
-- + Triggers updated_at
-- + Index de performance
-- + Données de test idempotentes
-- =====================================================================

CREATE OR REPLACE FUNCTION courtier_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. BROKER_CLIENTS (Portefeuille clients courtier)
-- =====================================================================
CREATE TABLE IF NOT EXISTS broker_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Entreprise'
  CHECK (type IN ('Particulier', 'Entreprise', 'TPE', 'PME', 'Grand Compte'));
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Maroc';
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS rc_number TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS ice_number TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Prospect'
  CHECK (status IN ('Prospect', 'Actif', 'Inactif', 'Bloqué'));
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE broker_clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_broker_clients_created_by ON broker_clients(created_by);
CREATE INDEX IF NOT EXISTS idx_broker_clients_status ON broker_clients(status);
CREATE INDEX IF NOT EXISTS idx_broker_clients_type ON broker_clients(type);
CREATE INDEX IF NOT EXISTS idx_broker_clients_name ON broker_clients(name);

DROP TRIGGER IF EXISTS trg_broker_clients_updated_at ON broker_clients;
CREATE TRIGGER trg_broker_clients_updated_at
  BEFORE UPDATE ON broker_clients
  FOR EACH ROW EXECUTE FUNCTION courtier_set_updated_at();

ALTER TABLE broker_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_clients_select_own ON broker_clients;
CREATE POLICY broker_clients_select_own ON broker_clients FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS broker_clients_insert_own ON broker_clients;
CREATE POLICY broker_clients_insert_own ON broker_clients FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS broker_clients_update_own ON broker_clients;
CREATE POLICY broker_clients_update_own ON broker_clients FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS broker_clients_delete_own ON broker_clients;
CREATE POLICY broker_clients_delete_own ON broker_clients FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- 2. CREDIT_APPLICATIONS (Demandes de crédit pour acquisition d'engins)
-- =====================================================================
CREATE TABLE IF NOT EXISTS credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES broker_clients(id) ON DELETE SET NULL;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS client_name_snapshot TEXT;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS equipment_label TEXT NOT NULL DEFAULT '';
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS equipment_value DECIMAL(14, 2);
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS requested_amount DECIMAL(14, 2);
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS down_payment DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT 60;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5, 2);
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS monthly_payment DECIMAL(12, 2);
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS application_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS expected_decision_date DATE;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS decision_date DATE;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS disbursement_date DATE;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En cours'
  CHECK (status IN ('Brouillon', 'En cours', 'Approuvé', 'Refusé', 'Décaissé', 'Annulé'));
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 2) DEFAULT 1.50;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12, 2);
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_credit_apps_created_by ON credit_applications(created_by);
CREATE INDEX IF NOT EXISTS idx_credit_apps_status ON credit_applications(status);
CREATE INDEX IF NOT EXISTS idx_credit_apps_client ON credit_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_apps_application_date ON credit_applications(application_date);
CREATE INDEX IF NOT EXISTS idx_credit_apps_expected_decision ON credit_applications(expected_decision_date);

DROP TRIGGER IF EXISTS trg_credit_apps_updated_at ON credit_applications;
CREATE TRIGGER trg_credit_apps_updated_at
  BEFORE UPDATE ON credit_applications
  FOR EACH ROW EXECUTE FUNCTION courtier_set_updated_at();

-- Trigger : recalcul automatique commission_amount = requested_amount * commission_rate / 100
CREATE OR REPLACE FUNCTION courtier_compute_credit_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.commission_amount IS NULL OR NEW.commission_amount = 0 THEN
    IF NEW.requested_amount IS NOT NULL AND NEW.commission_rate IS NOT NULL THEN
      NEW.commission_amount = ROUND(NEW.requested_amount * NEW.commission_rate / 100, 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_apps_commission ON credit_applications;
CREATE TRIGGER trg_credit_apps_commission
  BEFORE INSERT OR UPDATE ON credit_applications
  FOR EACH ROW EXECUTE FUNCTION courtier_compute_credit_commission();

ALTER TABLE credit_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_apps_select_own ON credit_applications;
CREATE POLICY credit_apps_select_own ON credit_applications FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS credit_apps_insert_own ON credit_applications;
CREATE POLICY credit_apps_insert_own ON credit_applications FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS credit_apps_update_own ON credit_applications;
CREATE POLICY credit_apps_update_own ON credit_applications FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS credit_apps_delete_own ON credit_applications;
CREATE POLICY credit_apps_delete_own ON credit_applications FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- 3. INSURANCE_POLICIES (Polices d'assurance — RC, Tous risques, Bris machine, MRC)
-- =====================================================================
CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policy_number TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES broker_clients(id) ON DELETE SET NULL;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS client_name_snapshot TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS equipment_label TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS insurer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'Tous risques'
  CHECK (policy_type IN (
    'Responsabilité Civile',
    'Tous risques',
    'Bris de machine',
    'Multirisques chantier',
    'Transport marchandises',
    'Flotte automobile',
    'Multirisques professionnelle'
  ));
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS insured_value DECIMAL(14, 2);
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS annual_premium DECIMAL(12, 2);
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'Annuel'
  CHECK (payment_frequency IN ('Mensuel', 'Trimestriel', 'Semestriel', 'Annuel'));
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active'
  CHECK (status IN ('Devis', 'En cours', 'Active', 'Expirée', 'Résiliée', 'Suspendue'));
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 2) DEFAULT 12.00;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12, 2);
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS deductible DECIMAL(12, 2);
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS claim_count INTEGER DEFAULT 0;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT TRUE;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_policies_created_by ON insurance_policies(created_by);
CREATE INDEX IF NOT EXISTS idx_policies_status ON insurance_policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_client ON insurance_policies(client_id);
CREATE INDEX IF NOT EXISTS idx_policies_end_date ON insurance_policies(end_date);
CREATE INDEX IF NOT EXISTS idx_policies_insurer ON insurance_policies(insurer_name);

DROP TRIGGER IF EXISTS trg_policies_updated_at ON insurance_policies;
CREATE TRIGGER trg_policies_updated_at
  BEFORE UPDATE ON insurance_policies
  FOR EACH ROW EXECUTE FUNCTION courtier_set_updated_at();

-- Trigger : recalcul automatique commission_amount = annual_premium * commission_rate / 100
CREATE OR REPLACE FUNCTION courtier_compute_policy_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.commission_amount IS NULL OR NEW.commission_amount = 0 THEN
    IF NEW.annual_premium IS NOT NULL AND NEW.commission_rate IS NOT NULL THEN
      NEW.commission_amount = ROUND(NEW.annual_premium * NEW.commission_rate / 100, 2);
    END IF;
  END IF;
  -- Auto end_date à start_date + 1 an si non renseignée
  IF NEW.end_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.end_date = NEW.start_date + INTERVAL '1 year';
  END IF;
  -- Auto policy_number si vide
  IF NEW.policy_number IS NULL OR NEW.policy_number = '' THEN
    NEW.policy_number = 'POL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(NEW.id::TEXT, 1, 6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_policies_compute ON insurance_policies;
CREATE TRIGGER trg_policies_compute
  BEFORE INSERT OR UPDATE ON insurance_policies
  FOR EACH ROW EXECUTE FUNCTION courtier_compute_policy_commission();

ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policies_select_own ON insurance_policies;
CREATE POLICY policies_select_own ON insurance_policies FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS policies_insert_own ON insurance_policies;
CREATE POLICY policies_insert_own ON insurance_policies FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS policies_update_own ON insurance_policies;
CREATE POLICY policies_update_own ON insurance_policies FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS policies_delete_own ON insurance_policies;
CREATE POLICY policies_delete_own ON insurance_policies FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- DONNÉES DE TEST IDEMPOTENTES
-- =====================================================================
DO $$
DECLARE
  v_user_id UUID;
  v_client1_id UUID;
  v_client2_id UUID;
  v_client3_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Aucun user — skip insertion test data courtier';
    RETURN;
  END IF;

  -- BROKER CLIENTS
  IF NOT EXISTS (SELECT 1 FROM broker_clients WHERE created_by = v_user_id AND name = 'BTP Atlas SARL') THEN
    INSERT INTO broker_clients (name, company_name, type, email, phone, city, sector, ice_number, status, created_by)
    VALUES ('BTP Atlas SARL', 'BTP Atlas SARL', 'PME', 'contact@btpatlas.ma', '+212 524 33 22 11', 'Marrakech', 'BTP / Construction', '001234567000089', 'Actif', v_user_id)
    RETURNING id INTO v_client1_id;
  ELSE
    SELECT id INTO v_client1_id FROM broker_clients WHERE created_by = v_user_id AND name = 'BTP Atlas SARL' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM broker_clients WHERE created_by = v_user_id AND name = 'OCP Bouskoura') THEN
    INSERT INTO broker_clients (name, company_name, type, email, phone, city, sector, ice_number, status, created_by)
    VALUES ('OCP Bouskoura', 'OCP Group', 'Grand Compte', 'achat-engins@ocpgroup.ma', '+212 522 67 89 00', 'Casablanca', 'Mines / Phosphates', '000456789000045', 'Actif', v_user_id)
    RETURNING id INTO v_client2_id;
  ELSE
    SELECT id INTO v_client2_id FROM broker_clients WHERE created_by = v_user_id AND name = 'OCP Bouskoura' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM broker_clients WHERE created_by = v_user_id AND name = 'Carrières du Doukkala') THEN
    INSERT INTO broker_clients (name, company_name, type, email, phone, city, sector, status, created_by)
    VALUES ('Carrières du Doukkala', 'Carrières du Doukkala SA', 'PME', 'direction@carrieres-doukkala.ma', '+212 523 34 56 78', 'El Jadida', 'Carrières / Granulats', 'Prospect', v_user_id)
    RETURNING id INTO v_client3_id;
  ELSE
    SELECT id INTO v_client3_id FROM broker_clients WHERE created_by = v_user_id AND name = 'Carrières du Doukkala' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM broker_clients WHERE created_by = v_user_id AND name = 'Ahmed Zerouali') THEN
    INSERT INTO broker_clients (name, type, email, phone, city, status, created_by)
    VALUES ('Ahmed Zerouali', 'Particulier', 'a.zerouali@gmail.com', '+212 6 78 12 34 56', 'Tanger', 'Actif', v_user_id);
  END IF;

  -- CREDIT APPLICATIONS
  IF NOT EXISTS (SELECT 1 FROM credit_applications WHERE created_by = v_user_id AND equipment_label = 'Pelle Caterpillar 320D') THEN
    INSERT INTO credit_applications (
      reference, client_id, client_name_snapshot, equipment_label, equipment_value, requested_amount,
      down_payment, duration_months, interest_rate, monthly_payment, bank_name,
      application_date, expected_decision_date, status, commission_rate, notes, created_by
    )
    VALUES (
      'CR-2026-001', v_client1_id, 'BTP Atlas SARL', 'Pelle Caterpillar 320D', 950000, 750000,
      200000, 60, 6.50, 14680, 'Banque Populaire',
      CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '10 days', 'En cours', 1.50,
      'Dossier complet. Garantie : nantissement engin + caution dirigeant.', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM credit_applications WHERE created_by = v_user_id AND reference = 'CR-2026-002') THEN
    INSERT INTO credit_applications (
      reference, client_id, client_name_snapshot, equipment_label, equipment_value, requested_amount,
      down_payment, duration_months, interest_rate, monthly_payment, bank_name,
      application_date, expected_decision_date, decision_date, disbursement_date,
      status, commission_rate, created_by
    )
    VALUES (
      'CR-2026-002', v_client2_id, 'OCP Bouskoura', 'Lot 3 Camions-bennes Mercedes Arocs', 4200000, 3500000,
      700000, 84, 5.80, 50820, 'Attijariwafa Bank',
      CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE - INTERVAL '8 days',
      'Décaissé', 1.20, v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM credit_applications WHERE created_by = v_user_id AND reference = 'CR-2026-003') THEN
    INSERT INTO credit_applications (
      reference, client_id, client_name_snapshot, equipment_label, equipment_value, requested_amount,
      down_payment, duration_months, interest_rate, monthly_payment, bank_name,
      application_date, expected_decision_date,
      status, commission_rate, notes, created_by
    )
    VALUES (
      'CR-2026-003', v_client3_id, 'Carrières du Doukkala', 'Concasseur mobile Sandvik QJ241', 2100000, 1800000,
      300000, 72, 6.95, 30200, 'Bank Of Africa',
      CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '5 days',
      'En cours', 1.75, 'Étude impact environnemental requise par la banque', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM credit_applications WHERE created_by = v_user_id AND reference = 'CR-2026-004') THEN
    INSERT INTO credit_applications (
      reference, client_id, client_name_snapshot, equipment_label, equipment_value, requested_amount,
      down_payment, duration_months, interest_rate, monthly_payment, bank_name,
      application_date, decision_date,
      status, commission_rate, created_by
    )
    VALUES (
      'CR-2026-004', v_client1_id, 'BTP Atlas SARL', 'Bulldozer Komatsu D65', 1450000, 1200000,
      250000, 60, 6.20, 23410, 'CIH Bank',
      CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE - INTERVAL '20 days',
      'Approuvé', 1.50, v_user_id
    );
  END IF;

  -- INSURANCE POLICIES
  IF NOT EXISTS (SELECT 1 FROM insurance_policies WHERE created_by = v_user_id AND client_name_snapshot = 'BTP Atlas SARL' AND policy_type = 'Tous risques') THEN
    INSERT INTO insurance_policies (
      policy_number, client_id, client_name_snapshot, equipment_label, insurer_name, policy_type,
      insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate,
      deductible, created_by
    )
    VALUES (
      'POL-2025-A0451', v_client1_id, 'BTP Atlas SARL', 'Pelle Caterpillar 320D', 'AXA Assurance Maroc', 'Tous risques',
      950000, 38500, 'Annuel', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '305 days', 'Active', 12.00,
      15000, v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM insurance_policies WHERE created_by = v_user_id AND client_name_snapshot = 'OCP Bouskoura' AND policy_type = 'Multirisques chantier') THEN
    INSERT INTO insurance_policies (
      policy_number, client_id, client_name_snapshot, equipment_label, insurer_name, policy_type,
      insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate,
      deductible, claim_count, created_by
    )
    VALUES (
      'POL-2025-MRC-2189', v_client2_id, 'OCP Bouskoura', 'Flotte 3 camions Mercedes Arocs', 'Wafa Assurance', 'Multirisques chantier',
      4200000, 168000, 'Trimestriel', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '275 days', 'Active', 14.00,
      50000, 1, v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM insurance_policies WHERE created_by = v_user_id AND client_name_snapshot = 'BTP Atlas SARL' AND policy_type = 'Responsabilité Civile') THEN
    INSERT INTO insurance_policies (
      policy_number, client_id, client_name_snapshot, insurer_name, policy_type,
      insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate, created_by
    )
    VALUES (
      'POL-2025-RC-0099', v_client1_id, 'BTP Atlas SARL', 'SAHAM Assurance', 'Responsabilité Civile',
      2000000, 12500, 'Annuel', CURRENT_DATE - INTERVAL '300 days', CURRENT_DATE + INTERVAL '40 days', 'Active', 15.00, v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM insurance_policies WHERE created_by = v_user_id AND client_name_snapshot = 'BTP Atlas SARL' AND policy_type = 'Bris de machine') THEN
    INSERT INTO insurance_policies (
      policy_number, client_id, client_name_snapshot, equipment_label, insurer_name, policy_type,
      insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate,
      deductible, created_by
    )
    VALUES (
      'POL-2025-BM-3344', v_client1_id, 'BTP Atlas SARL', 'Bulldozer Komatsu D65', 'AtlantaSanad', 'Bris de machine',
      1450000, 28900, 'Annuel', CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE + INTERVAL '345 days', 'Active', 13.50,
      20000, v_user_id
    );
  END IF;

  -- Police bientôt expirée (test alerte)
  IF NOT EXISTS (SELECT 1 FROM insurance_policies WHERE created_by = v_user_id AND policy_number = 'POL-EXPIRE-SOON') THEN
    INSERT INTO insurance_policies (
      policy_number, client_id, client_name_snapshot, equipment_label, insurer_name, policy_type,
      insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate,
      auto_renewal, created_by
    )
    VALUES (
      'POL-EXPIRE-SOON', v_client3_id, 'Carrières du Doukkala', 'Chargeuse Volvo L120H', 'AXA Assurance Maroc', 'Tous risques',
      850000, 32500, 'Annuel', CURRENT_DATE - INTERVAL '350 days', CURRENT_DATE + INTERVAL '15 days', 'Active', 11.50,
      FALSE, v_user_id
    );
  END IF;

  -- Devis en attente
  IF NOT EXISTS (SELECT 1 FROM insurance_policies WHERE created_by = v_user_id AND status = 'Devis' AND client_name_snapshot = 'Carrières du Doukkala') THEN
    INSERT INTO insurance_policies (
      policy_number, client_id, client_name_snapshot, equipment_label, insurer_name, policy_type,
      insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate, created_by
    )
    VALUES (
      'DEV-2026-0042', v_client3_id, 'Carrières du Doukkala', 'Concasseur mobile Sandvik QJ241', 'Wafa Assurance', 'Multirisques chantier',
      2100000, 84500, 'Trimestriel', CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '370 days', 'Devis', 14.00, v_user_id
    );
  END IF;

  RAISE NOTICE 'Données de test courtier créées/mises à jour pour user_id=%', v_user_id;
END $$;

-- =====================================================================
-- VÉRIFICATION FINALE
-- =====================================================================
DO $$
DECLARE
  v_clients INT;
  v_credits INT;
  v_policies INT;
BEGIN
  SELECT COUNT(*) INTO v_clients FROM broker_clients;
  SELECT COUNT(*) INTO v_credits FROM credit_applications;
  SELECT COUNT(*) INTO v_policies FROM insurance_policies;
  RAISE NOTICE '✅ Courtier déployé : % clients, % demandes crédit, % polices assurance',
    v_clients, v_credits, v_policies;
END $$;
