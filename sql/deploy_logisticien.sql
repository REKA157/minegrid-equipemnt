-- =====================================================================
-- DEPLOY LOGISTICIEN / SUPPLY CHAIN — migration-safe
-- 4 tables : logistics_warehouses, logistics_route_tracking,
--            logistics_scm_kpis_monthly, logistics_stock_alerts
-- RLS : auth.uid() = created_by
-- =====================================================================

CREATE OR REPLACE FUNCTION logisticien_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Entrepôts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS capacity_pallets INTEGER NOT NULL DEFAULT 0 CHECK (capacity_pallets >= 0);
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS used_pallets INTEGER NOT NULL DEFAULT 0 CHECK (used_pallets >= 0);
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Opérationnel'
  CHECK (status IN ('Opérationnel', 'Surchargé', 'Maintenance', 'Fermé'));
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE logistics_warehouses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lw_created_by ON logistics_warehouses(created_by);

DROP TRIGGER IF EXISTS trg_lw_updated_at ON logistics_warehouses;
CREATE TRIGGER trg_lw_updated_at
  BEFORE UPDATE ON logistics_warehouses
  FOR EACH ROW EXECUTE FUNCTION logisticien_set_updated_at();

ALTER TABLE logistics_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lw_select_own ON logistics_warehouses;
CREATE POLICY lw_select_own ON logistics_warehouses FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lw_insert_own ON logistics_warehouses;
CREATE POLICY lw_insert_own ON logistics_warehouses FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS lw_update_own ON logistics_warehouses;
CREATE POLICY lw_update_own ON logistics_warehouses FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lw_delete_own ON logistics_warehouses;
CREATE POLICY lw_delete_own ON logistics_warehouses FOR DELETE USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- Suivi routes (carte : origine → destination + position véhicule)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics_route_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS route_ref TEXT;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS vehicle_label TEXT;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Planifié'
  CHECK (status IN ('Planifié', 'En route', 'Livré', 'Retard', 'Annulé'));
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS origin_lat DECIMAL(10, 6);
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS origin_lng DECIMAL(10, 6);
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS dest_lat DECIMAL(10, 6);
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS dest_lng DECIMAL(10, 6);
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10, 6);
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS current_lng DECIMAL(10, 6);
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS origin_label TEXT;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS dest_label TEXT;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS cargo_summary TEXT;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lrt_created_by ON logistics_route_tracking(created_by);
CREATE INDEX IF NOT EXISTS idx_lrt_status ON logistics_route_tracking(status);

DROP TRIGGER IF EXISTS trg_lrt_updated_at ON logistics_route_tracking;
CREATE TRIGGER trg_lrt_updated_at
  BEFORE UPDATE ON logistics_route_tracking
  FOR EACH ROW EXECUTE FUNCTION logisticien_set_updated_at();

ALTER TABLE logistics_route_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lrt_select_own ON logistics_route_tracking;
CREATE POLICY lrt_select_own ON logistics_route_tracking FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lrt_insert_own ON logistics_route_tracking;
CREATE POLICY lrt_insert_own ON logistics_route_tracking FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS lrt_update_own ON logistics_route_tracking;
CREATE POLICY lrt_update_own ON logistics_route_tracking FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lrt_delete_own ON logistics_route_tracking;
CREATE POLICY lrt_delete_own ON logistics_route_tracking FOR DELETE USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- KPIs mensuels supply chain
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics_scm_kpis_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS period_month DATE NOT NULL;
ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS on_time_pct DECIMAL(5, 2);
ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS fill_rate_pct DECIMAL(5, 2);
ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS avg_lead_time_days DECIMAL(5, 2);
ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS incidents INTEGER DEFAULT 0;
ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE logistics_scm_kpis_monthly ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS lskm_user_month ON logistics_scm_kpis_monthly (created_by, period_month);
CREATE INDEX IF NOT EXISTS idx_lskm_created_by ON logistics_scm_kpis_monthly(created_by);

ALTER TABLE logistics_scm_kpis_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lskm_select_own ON logistics_scm_kpis_monthly;
CREATE POLICY lskm_select_own ON logistics_scm_kpis_monthly FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lskm_insert_own ON logistics_scm_kpis_monthly;
CREATE POLICY lskm_insert_own ON logistics_scm_kpis_monthly FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS lskm_update_own ON logistics_scm_kpis_monthly;
CREATE POLICY lskm_update_own ON logistics_scm_kpis_monthly FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lskm_delete_own ON logistics_scm_kpis_monthly;
CREATE POLICY lskm_delete_own ON logistics_scm_kpis_monthly FOR DELETE USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- Alertes stock
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics_stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS sku_label TEXT NOT NULL DEFAULT '';
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS warehouse_name TEXT;
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS alert_type TEXT NOT NULL DEFAULT 'Seuil bas'
  CHECK (alert_type IN ('Rupture', 'Excédent', 'Seuil bas'));
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS current_qty DECIMAL(12, 2);
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS target_qty DECIMAL(12, 2);
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Normal'
  CHECK (priority IN ('Normal', 'Urgent'));
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Ouvert'
  CHECK (status IN ('Ouvert', 'En traitement', 'Clôturé'));
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE logistics_stock_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lsa_created_by ON logistics_stock_alerts(created_by);
CREATE INDEX IF NOT EXISTS idx_lsa_status ON logistics_stock_alerts(status);

DROP TRIGGER IF EXISTS trg_lsa_updated_at ON logistics_stock_alerts;
CREATE TRIGGER trg_lsa_updated_at
  BEFORE UPDATE ON logistics_stock_alerts
  FOR EACH ROW EXECUTE FUNCTION logisticien_set_updated_at();

ALTER TABLE logistics_stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lsa_select_own ON logistics_stock_alerts;
CREATE POLICY lsa_select_own ON logistics_stock_alerts FOR SELECT USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lsa_insert_own ON logistics_stock_alerts;
CREATE POLICY lsa_insert_own ON logistics_stock_alerts FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS lsa_update_own ON logistics_stock_alerts;
CREATE POLICY lsa_update_own ON logistics_stock_alerts FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS lsa_delete_own ON logistics_stock_alerts;
CREATE POLICY lsa_delete_own ON logistics_stock_alerts FOR DELETE USING (auth.uid() = created_by);

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
    RAISE NOTICE 'Aucun user auth — skip données test logisticien';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM logistics_warehouses WHERE created_by = v_user_id AND name = 'Hub Aïn Sebaâ') THEN
    INSERT INTO logistics_warehouses (name, city, zone, capacity_pallets, used_pallets, status, notes, created_by)
    VALUES ('Hub Aïn Sebaâ', 'Casablanca', 'Casa métropole', 4200, 3780, 'Opérationnel', 'Pic saisonnier BTP', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_warehouses WHERE created_by = v_user_id AND name = 'DCE Tanger Med Logistics') THEN
    INSERT INTO logistics_warehouses (name, city, zone, capacity_pallets, used_pallets, status, created_by)
    VALUES ('DCE Tanger Med Logistics', 'Tanger', 'Nord', 5100, 4650, 'Surchargé', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_warehouses WHERE created_by = v_user_id AND name = 'Plateforme Fès') THEN
    INSERT INTO logistics_warehouses (name, city, zone, capacity_pallets, used_pallets, status, created_by)
    VALUES ('Plateforme Fès', 'Fès', 'Oriental', 2100, 1320, 'Opérationnel', v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM logistics_route_tracking WHERE created_by = v_user_id AND route_ref = 'RT-CAS-0288') THEN
    INSERT INTO logistics_route_tracking (route_ref, vehicle_label, status, origin_lat, origin_lng, dest_lat, dest_lng, current_lat, current_lng, origin_label, dest_label, cargo_summary, eta, created_by)
    VALUES ('RT-CAS-0288', 'Mercedes Actros 1845', 'En route', 33.608, -7.479, 34.020, -5.009, 33.92, -6.25, 'Tanger Med', 'Fès', 'Pièces filtres & hydraulique', NOW() + INTERVAL '6 hours', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_route_tracking WHERE created_by = v_user_id AND route_ref = 'RT-CAS-0291') THEN
    INSERT INTO logistics_route_tracking (route_ref, vehicle_label, status, origin_lat, origin_lng, dest_lat, dest_lng, current_lat, current_lng, origin_label, dest_label, cargo_summary, eta, created_by)
    VALUES ('RT-CAS-0291', 'Renault T High', 'Retard', 31.7917, -8.0083, 33.5731, -7.5898, 32.15, -7.85, 'Marrakech', 'Casablanca Hub', 'Lots palettes CP', NOW() - INTERVAL '45 minutes', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_route_tracking WHERE created_by = v_user_id AND route_ref = 'RT-CAS-0295') THEN
    INSERT INTO logistics_route_tracking (route_ref, vehicle_label, status, origin_lat, origin_lng, dest_lat, dest_lng, origin_label, dest_label, cargo_summary, eta, created_by)
    VALUES ('RT-CAS-0295', 'Volvo FH16', 'Planifié', 33.57, -7.59, 35.7595, -5.834, 'Casablanca', 'Nador', 'Châssis projet minier', NOW() + INTERVAL '26 hours', v_user_id);
  END IF;

  FOR m IN 0..5 LOOP
    d := (date_trunc('month', CURRENT_DATE::timestamp) - make_interval(months => m))::date;
    IF NOT EXISTS (SELECT 1 FROM logistics_scm_kpis_monthly WHERE created_by = v_user_id AND period_month = d) THEN
      INSERT INTO logistics_scm_kpis_monthly (period_month, on_time_pct, fill_rate_pct, avg_lead_time_days, incidents, created_by)
      VALUES (d, 91.5 + (5 - m) * 0.4, 84.0 - m * 0.5, 3.2 + m * 0.1, GREATEST(0, 4 - m), v_user_id);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM logistics_stock_alerts WHERE created_by = v_user_id AND sku_label = 'FIL-HYD-2040-B') THEN
    INSERT INTO logistics_stock_alerts (sku_label, warehouse_name, alert_type, current_qty, target_qty, priority, status, notes, created_by)
    VALUES ('FIL-HYD-2040-B', 'Hub Aïn Sebaâ', 'Rupture', 0, 120, 'Urgent', 'Ouvert', 'Commande fournisseur J+3', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_stock_alerts WHERE created_by = v_user_id AND sku_label = 'CHN-KOM-PC350') THEN
    INSERT INTO logistics_stock_alerts (sku_label, warehouse_name, alert_type, current_qty, target_qty, priority, status, created_by)
    VALUES ('CHN-KOM-PC350', 'DCE Tanger Med', 'Seuil bas', 8, 25, 'Normal', 'En traitement', v_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_stock_alerts WHERE created_by = v_user_id AND sku_label = 'PAL-EUR-1200') THEN
    INSERT INTO logistics_stock_alerts (sku_label, warehouse_name, alert_type, current_qty, target_qty, priority, status, created_by)
    VALUES ('PAL-EUR-1200', 'Plateforme Fès', 'Excédent', 1850, 900, 'Normal', 'Ouvert', v_user_id);
  END IF;

  RAISE NOTICE 'Logisticien : données test OK pour user %', v_user_id;
END $$;

DO $$
DECLARE
  w INT; r INT; k INT; a INT;
BEGIN
  SELECT COUNT(*) INTO w FROM logistics_warehouses;
  SELECT COUNT(*) INTO r FROM logistics_route_tracking;
  SELECT COUNT(*) INTO k FROM logistics_scm_kpis_monthly;
  SELECT COUNT(*) INTO a FROM logistics_stock_alerts;
  RAISE NOTICE 'Logisticien déployé : entrepôts=%, routes=%, KPIs=%, alertes=%', w, r, k, a;
END $$;
