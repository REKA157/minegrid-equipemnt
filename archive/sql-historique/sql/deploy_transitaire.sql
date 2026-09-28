-- =====================================================================
-- DEPLOY TRANSITAIRE — schéma migration-safe
-- 4 tables : customs_declarations, freight_containers, freight_monthly_volumes, freight_documents
-- RLS : auth.uid() = created_by
-- =====================================================================

CREATE OR REPLACE FUNCTION transitaire_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. DÉCLARATIONS DOUANIÈRES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En préparation'
  CHECK (status IN (
    'En préparation', 'Soumise', 'En contrôle douanier', 'Liquidée', 'Bloquée', 'Annulée'
  ));
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS clearance_type TEXT DEFAULT 'Import'
  CHECK (clearance_type IN ('Import', 'Export', 'Transit'));
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS customs_office TEXT;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS cargo_summary TEXT;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS declared_value_mad DECIMAL(14, 2);
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS expected_clearance_date DATE;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_customs_created_by ON customs_declarations(created_by);
CREATE INDEX IF NOT EXISTS idx_customs_status ON customs_declarations(status);

DROP TRIGGER IF EXISTS trg_customs_updated_at ON customs_declarations;
CREATE TRIGGER trg_customs_updated_at
  BEFORE UPDATE ON customs_declarations
  FOR EACH ROW EXECUTE FUNCTION transitaire_set_updated_at();

ALTER TABLE customs_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customs_select_own ON customs_declarations;
CREATE POLICY customs_select_own ON customs_declarations FOR SELECT
  USING (auth.uid() = created_by);
DROP POLICY IF EXISTS customs_insert_own ON customs_declarations;
CREATE POLICY customs_insert_own ON customs_declarations FOR INSERT
  WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS customs_update_own ON customs_declarations;
CREATE POLICY customs_update_own ON customs_declarations FOR UPDATE
  USING (auth.uid() = created_by);
DROP POLICY IF EXISTS customs_delete_own ON customs_declarations;
CREATE POLICY customs_delete_own ON customs_declarations FOR DELETE
  USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- 2. CONTENEURS (suivi + GPS)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS container_number TEXT NOT NULL DEFAULT '';
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En mer'
  CHECK (status IN ('En mer', 'Transbordement', 'À quai', 'Douane', 'Livré', 'Retard'));
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 6);
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 6);
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS vessel_name TEXT;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS voyage_ref TEXT;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS last_port TEXT;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS next_port TEXT;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_fc_created_by ON freight_containers(created_by);
CREATE INDEX IF NOT EXISTS idx_fc_status ON freight_containers(status);

DROP TRIGGER IF EXISTS trg_fc_updated_at ON freight_containers;
CREATE TRIGGER trg_fc_updated_at
  BEFORE UPDATE ON freight_containers
  FOR EACH ROW EXECUTE FUNCTION transitaire_set_updated_at();

ALTER TABLE freight_containers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fc_select_own ON freight_containers;
CREATE POLICY fc_select_own ON freight_containers FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS fc_insert_own ON freight_containers;
CREATE POLICY fc_insert_own ON freight_containers FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS fc_update_own ON freight_containers;
CREATE POLICY fc_update_own ON freight_containers FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS fc_delete_own ON freight_containers;
CREATE POLICY fc_delete_own ON freight_containers FOR DELETE USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- 3. VOLUMES MENSUELS I/E (graphiques)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight_monthly_volumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE freight_monthly_volumes ADD COLUMN IF NOT EXISTS period_month DATE NOT NULL;
ALTER TABLE freight_monthly_volumes ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL
  CHECK (direction IN ('Import', 'Export'));
ALTER TABLE freight_monthly_volumes ADD COLUMN IF NOT EXISTS teu_count DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE freight_monthly_volumes ADD COLUMN IF NOT EXISTS value_mad DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE freight_monthly_volumes ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE freight_monthly_volumes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS freight_monthly_user_period_dir
  ON freight_monthly_volumes (created_by, period_month, direction);
CREATE INDEX IF NOT EXISTS idx_fmv_created_by ON freight_monthly_volumes(created_by);

ALTER TABLE freight_monthly_volumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fmv_select_own ON freight_monthly_volumes;
CREATE POLICY fmv_select_own ON freight_monthly_volumes FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS fmv_insert_own ON freight_monthly_volumes;
CREATE POLICY fmv_insert_own ON freight_monthly_volumes FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS fmv_update_own ON freight_monthly_volumes;
CREATE POLICY fmv_update_own ON freight_monthly_volumes FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS fmv_delete_own ON freight_monthly_volumes;
CREATE POLICY fmv_delete_own ON freight_monthly_volumes FOR DELETE USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- 4. DOCUMENTS FRET
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'Autre'
  CHECK (doc_type IN ('Connaissement', 'Facture', 'Liste colisage', 'Certificat origine', 'Autre'));
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En attente'
  CHECK (status IN ('Brouillon', 'En attente', 'Validé', 'Rejeté', 'Expiré'));
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Normal'
  CHECK (priority IN ('Normal', 'Urgent'));
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS linked_container_number TEXT;
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS linked_declaration_ref TEXT;
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_fd_created_by ON freight_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_fd_status ON freight_documents(status);

DROP TRIGGER IF EXISTS trg_fd_updated_at ON freight_documents;
CREATE TRIGGER trg_fd_updated_at
  BEFORE UPDATE ON freight_documents
  FOR EACH ROW EXECUTE FUNCTION transitaire_set_updated_at();

ALTER TABLE freight_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fd_select_own ON freight_documents;
CREATE POLICY fd_select_own ON freight_documents FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS fd_insert_own ON freight_documents;
CREATE POLICY fd_insert_own ON freight_documents FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS fd_update_own ON freight_documents;
CREATE POLICY fd_update_own ON freight_documents FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS fd_delete_own ON freight_documents;
CREATE POLICY fd_delete_own ON freight_documents FOR DELETE USING (auth.uid() = created_by);

-- =====================================================================
-- Données de test idempotentes
-- =====================================================================
DO $$
DECLARE
  v_user_id UUID;
  m INT;
  d DATE;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Aucun user auth — skip données test transitaire';
    RETURN;
  END IF;

  -- Déclarations
  IF NOT EXISTS (SELECT 1 FROM customs_declarations WHERE created_by = v_user_id AND reference = 'DAM-2026-0102') THEN
    INSERT INTO customs_declarations (reference, status, clearance_type, customs_office, client_name, cargo_summary, declared_value_mad, submitted_at, expected_clearance_date, notes, created_by)
    VALUES ('DAM-2026-0102', 'En contrôle douanier', 'Import', 'Port Casablanca (Scan)', 'Ciments du Maroc SA', '40'' HC équipements miniers — pièces détachées', 2450000, NOW() - INTERVAL '3 days', CURRENT_DATE + 2, 'Attente rapport scanner', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customs_declarations WHERE created_by = v_user_id AND reference = 'DAM-2026-0098') THEN
    INSERT INTO customs_declarations (reference, status, clearance_type, customs_office, client_name, cargo_summary, declared_value_mad, submitted_at, expected_clearance_date, notes, created_by)
    VALUES ('DAM-2026-0098', 'Soumise', 'Import', 'Tanger Med', 'Atlas Mining Equipment', '2×40'' conteneurs chenilles', 4100000, NOW() - INTERVAL '1 day', CURRENT_DATE + 5, NULL, v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customs_declarations WHERE created_by = v_user_id AND reference = 'DEX-2026-0044') THEN
    INSERT INTO customs_declarations (reference, status, clearance_type, customs_office, client_name, cargo_summary, declared_value_mad, submitted_at, expected_clearance_date, notes, created_by)
    VALUES ('DEX-2026-0044', 'En préparation', 'Export', 'Agadir', 'OCP Shipping', 'Big bags phosphate — lot 12', 890000, NULL, CURRENT_DATE + 10, 'Facture proforma à finaliser', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customs_declarations WHERE created_by = v_user_id AND reference = 'DAM-2026-0088') THEN
    INSERT INTO customs_declarations (reference, status, clearance_type, customs_office, client_name, cargo_summary, declared_value_mad, submitted_at, expected_clearance_date, notes, created_by)
    VALUES ('DAM-2026-0088', 'Bloquée', 'Import', 'Port Casablanca', 'BTP Horizon', 'Bulldozer démonté — pièce manquante dossier', 6200000, NOW() - INTERVAL '12 days', CURRENT_DATE - 1, 'L388 certificat origine — relance client', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customs_declarations WHERE created_by = v_user_id AND reference = 'DAM-2025-0990') THEN
    INSERT INTO customs_declarations (reference, status, clearance_type, customs_office, client_name, cargo_summary, declared_value_mad, submitted_at, expected_clearance_date, created_by)
    VALUES ('DAM-2025-0990', 'Liquidée', 'Import', 'Tanger Med', 'Safi Energy', 'Turbine pièces', 1800000, NOW() - INTERVAL '60 days', CURRENT_DATE - INTERVAL '45 days', v_user_id);
  END IF;

  -- Conteneurs (coordonnées approx. ports / large maritime)
  IF NOT EXISTS (SELECT 1 FROM freight_containers WHERE created_by = v_user_id AND container_number = 'MSKU 9123456') THEN
    INSERT INTO freight_containers (container_number, status, lat, lng, vessel_name, last_port, next_port, eta, voyage_ref, created_by)
    VALUES ('MSKU 9123456', 'À quai', 33.608, -7.479, 'MSC LENI', 'Tanger Med', 'Casablanca', NOW() + INTERVAL '18 hours', 'VY-MA426', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM freight_containers WHERE created_by = v_user_id AND container_number = 'TEMU 7788123') THEN
    INSERT INTO freight_containers (container_number, status, lat, lng, vessel_name, last_port, next_port, eta, voyage_ref, created_by)
    VALUES ('TEMU 7788123', 'En mer', 35.2, -8.1, 'CMA CGM TAGE', 'Algésiras', 'Casablanca', NOW() + INTERVAL '2 days', 'AE-CAS-09', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM freight_containers WHERE created_by = v_user_id AND container_number = 'OOLU 4455661') THEN
    INSERT INTO freight_containers (container_number, status, lat, lng, vessel_name, last_port, next_port, eta, created_by)
    VALUES ('OOLU 4455661', 'Douane', 33.605, -7.515, 'OOCL ROTTERDAM', 'Anvers', 'Casablanca', NOW() + INTERVAL '6 hours', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM freight_containers WHERE created_by = v_user_id AND container_number = 'FCIU 2211009') THEN
    INSERT INTO freight_containers (container_number, status, lat, lng, last_port, next_port, eta, notes, created_by)
    VALUES ('FCIU 2211009', 'Retard', 30.4, -9.6, 'Mohammedia', 'Livraison client', NOW() - INTERVAL '1 day', 'Retard déchargement — créneau réaffrété', v_user_id);
  END IF;

  -- Volumes mensuels (6 derniers mois)
  FOR m IN 0..5 LOOP
    d := (date_trunc('month', CURRENT_DATE::timestamp) - make_interval(months => m))::date;
    IF NOT EXISTS (SELECT 1 FROM freight_monthly_volumes WHERE created_by = v_user_id AND period_month = d AND direction = 'Import') THEN
      INSERT INTO freight_monthly_volumes (period_month, direction, teu_count, value_mad, created_by)
      VALUES (d, 'Import', 42 + (5 - m) * 3.5, 12000000 + m * 800000, v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM freight_monthly_volumes WHERE created_by = v_user_id AND period_month = d AND direction = 'Export') THEN
      INSERT INTO freight_monthly_volumes (period_month, direction, teu_count, value_mad, created_by)
      VALUES (d, 'Export', 28 + (5 - m) * 2.2, 8500000 + m * 500000, v_user_id);
    END IF;
  END LOOP;

  -- Documents
  IF NOT EXISTS (SELECT 1 FROM freight_documents WHERE created_by = v_user_id AND title = 'B/L — MSKU 9123456') THEN
    INSERT INTO freight_documents (title, doc_type, status, priority, due_date, linked_container_number, linked_declaration_ref, notes, created_by)
    VALUES ('B/L — MSKU 9123456', 'Connaissement', 'En attente', 'Urgent', CURRENT_DATE + 1, 'MSKU 9123456', 'DAM-2026-0102', 'Original attendu transitaire Rotterdam', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM freight_documents WHERE created_by = v_user_id AND title = 'Facture commerciale DEX-2026-0044') THEN
    INSERT INTO freight_documents (title, doc_type, status, priority, due_date, linked_declaration_ref, created_by)
    VALUES ('Facture commerciale DEX-2026-0044', 'Facture', 'Brouillon', 'Normal', CURRENT_DATE + 7, 'DEX-2026-0044', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM freight_documents WHERE created_by = v_user_id AND title = 'Certificat filière OCP') THEN
    INSERT INTO freight_documents (title, doc_type, status, priority, due_date, notes, created_by)
    VALUES ('Certificat filière OCP', 'Certificat origine', 'Validé', 'Normal', CURRENT_DATE + 14, 'Archivé douane export', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM freight_documents WHERE created_by = v_user_id AND title = 'Liste de colisage LCL Tanger') THEN
    INSERT INTO freight_documents (title, doc_type, status, priority, due_date, notes, created_by)
    VALUES ('Liste de colisage LCL Tanger', 'Liste colisage', 'Rejeté', 'Urgent', CURRENT_DATE - 2, 'Incohérence poids brut — à renvoyer', v_user_id);
  END IF;

  RAISE NOTICE 'Transitaire : données test OK pour user %', v_user_id;
END $$;

DO $$
DECLARE
  c INT; fc INT; fmv INT; fd INT;
BEGIN
  SELECT COUNT(*) INTO c FROM customs_declarations;
  SELECT COUNT(*) INTO fc FROM freight_containers;
  SELECT COUNT(*) INTO fmv FROM freight_monthly_volumes;
  SELECT COUNT(*) INTO fd FROM freight_documents;
  RAISE NOTICE 'Transitaire déployé : déclarations=%, conteneurs=%, volumes=%, documents=%', c, fc, fmv, fd;
END $$;
