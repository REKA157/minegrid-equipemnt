-- =====================================================================
-- DEPLOY TRANSPORTEUR — SCHÉMA MIGRATION-SAFE
-- 4 tables : drivers, vehicles, transport_routes, deliveries
-- + RLS strict (created_by = auth.uid())
-- + Triggers updated_at
-- + Index de performance
-- + Données de test idempotentes
-- =====================================================================

-- ---------------------------------------------------------------------
-- FONCTION updated_at partagée
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transporteur_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. DRIVERS (Chauffeurs)
-- =====================================================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'Disponible'
  CHECK (availability_status IN ('Disponible', 'En mission', 'En congé', 'Indisponible'));
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10, 6);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lng DECIMAL(10, 6);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_drivers_created_by ON drivers(created_by);
CREATE INDEX IF NOT EXISTS idx_drivers_availability ON drivers(availability_status);
CREATE INDEX IF NOT EXISTS idx_drivers_license_expiry ON drivers(license_expiry);

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers;
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION transporteur_set_updated_at();

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_select_own ON drivers;
CREATE POLICY drivers_select_own ON drivers FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS drivers_insert_own ON drivers;
CREATE POLICY drivers_insert_own ON drivers FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS drivers_update_own ON drivers;
CREATE POLICY drivers_update_own ON drivers FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS drivers_delete_own ON drivers;
CREATE POLICY drivers_delete_own ON drivers FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- 2. VEHICLES (Véhicules de transport)
-- =====================================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS plate_number TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Camion-plateau'
  CHECK (type IN ('Camion-plateau', 'Porte-engins', 'Semi-remorque', 'Utilitaire', 'Convoi exceptionnel'));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity_tons DECIMAL(10, 2);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Disponible'
  CHECK (status IN ('Disponible', 'En mission', 'Maintenance', 'Hors service'));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10, 6);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_lng DECIMAL(10, 6);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_level INTEGER CHECK (fuel_level BETWEEN 0 AND 100);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_maintenance_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vehicles_created_by ON vehicles(created_by);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(type);

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION transporteur_set_updated_at();

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_select_own ON vehicles;
CREATE POLICY vehicles_select_own ON vehicles FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS vehicles_insert_own ON vehicles;
CREATE POLICY vehicles_insert_own ON vehicles FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS vehicles_update_own ON vehicles;
CREATE POLICY vehicles_update_own ON vehicles FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS vehicles_delete_own ON vehicles;
CREATE POLICY vehicles_delete_own ON vehicles FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- 3. TRANSPORT_ROUTES (Référentiel routes)
-- =====================================================================
CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS origin_city TEXT;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS origin_lat DECIMAL(10, 6);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS origin_lng DECIMAL(10, 6);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS destination_city TEXT;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS destination_lat DECIMAL(10, 6);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS destination_lng DECIMAL(10, 6);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10, 2);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS average_duration_hours DECIMAL(6, 2);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS base_cost DECIMAL(12, 2);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_transport_routes_created_by ON transport_routes(created_by);

DROP TRIGGER IF EXISTS trg_transport_routes_updated_at ON transport_routes;
CREATE TRIGGER trg_transport_routes_updated_at
  BEFORE UPDATE ON transport_routes
  FOR EACH ROW EXECUTE FUNCTION transporteur_set_updated_at();

ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_routes_select_own ON transport_routes;
CREATE POLICY transport_routes_select_own ON transport_routes FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS transport_routes_insert_own ON transport_routes;
CREATE POLICY transport_routes_insert_own ON transport_routes FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS transport_routes_update_own ON transport_routes;
CREATE POLICY transport_routes_update_own ON transport_routes FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS transport_routes_delete_own ON transport_routes;
CREATE POLICY transport_routes_delete_own ON transport_routes FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- 4. DELIVERIES (Livraisons / Missions de transport)
-- =====================================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS equipment_id UUID;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS equipment_label TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES transport_routes(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS origin_address TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS origin_lat DECIMAL(10, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS origin_lng DECIMAL(10, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS destination_address TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS destination_lat DECIMAL(10, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS destination_lng DECIMAL(10, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS actual_delivery_date TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10, 2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS transport_cost DECIMAL(12, 2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Planifiée'
  CHECK (status IN ('Planifiée', 'En cours', 'Livrée', 'Retardée', 'Annulée'));
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Moyenne'
  CHECK (priority IN ('Basse', 'Moyenne', 'Haute', 'Urgente'));
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_deliveries_created_by ON deliveries(created_by);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_vehicle ON deliveries(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_pickup_date ON deliveries(pickup_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_expected_delivery ON deliveries(expected_delivery_date);

DROP TRIGGER IF EXISTS trg_deliveries_updated_at ON deliveries;
CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION transporteur_set_updated_at();

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deliveries_select_own ON deliveries;
CREATE POLICY deliveries_select_own ON deliveries FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS deliveries_insert_own ON deliveries;
CREATE POLICY deliveries_insert_own ON deliveries FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS deliveries_update_own ON deliveries;
CREATE POLICY deliveries_update_own ON deliveries FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS deliveries_delete_own ON deliveries;
CREATE POLICY deliveries_delete_own ON deliveries FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- DONNÉES DE TEST IDEMPOTENTES (uniquement si user authentifié)
-- =====================================================================
DO $$
DECLARE
  v_user_id UUID;
  v_driver1_id UUID;
  v_driver2_id UUID;
  v_vehicle1_id UUID;
  v_vehicle2_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Aucun user — skip insertion test data transporteur';
    RETURN;
  END IF;

  -- DRIVERS
  IF NOT EXISTS (SELECT 1 FROM drivers WHERE created_by = v_user_id AND name = 'Hassan El Amrani') THEN
    INSERT INTO drivers (name, phone, license_number, license_expiry, availability_status, current_lat, current_lng, last_location_update, created_by)
    VALUES ('Hassan El Amrani', '+212 6 12 34 56 78', 'MA-2018-44521', '2027-08-15', 'En mission', 33.5731, -7.5898, NOW() - INTERVAL '15 minutes', v_user_id)
    RETURNING id INTO v_driver1_id;
  ELSE
    SELECT id INTO v_driver1_id FROM drivers WHERE created_by = v_user_id AND name = 'Hassan El Amrani' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM drivers WHERE created_by = v_user_id AND name = 'Karim Benali') THEN
    INSERT INTO drivers (name, phone, license_number, license_expiry, availability_status, current_lat, current_lng, last_location_update, created_by)
    VALUES ('Karim Benali', '+212 6 87 65 43 21', 'MA-2019-78214', '2026-12-20', 'Disponible', 31.6295, -7.9811, NOW() - INTERVAL '2 hours', v_user_id)
    RETURNING id INTO v_driver2_id;
  ELSE
    SELECT id INTO v_driver2_id FROM drivers WHERE created_by = v_user_id AND name = 'Karim Benali' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM drivers WHERE created_by = v_user_id AND name = 'Mehdi Tazi') THEN
    INSERT INTO drivers (name, phone, license_number, license_expiry, availability_status, created_by)
    VALUES ('Mehdi Tazi', '+212 6 55 44 33 22', 'MA-2020-11587', '2026-06-30', 'En congé', v_user_id);
  END IF;

  -- VEHICLES
  IF NOT EXISTS (SELECT 1 FROM vehicles WHERE created_by = v_user_id AND plate_number = '12345-A-6') THEN
    INSERT INTO vehicles (plate_number, type, brand, model, capacity_tons, status, current_driver_id, current_lat, current_lng, last_location_update, fuel_level, next_maintenance_date, created_by)
    VALUES ('12345-A-6', 'Porte-engins', 'Renault', 'T High 520', 40, 'En mission', v_driver1_id, 33.5731, -7.5898, NOW() - INTERVAL '15 minutes', 65, '2026-06-15', v_user_id)
    RETURNING id INTO v_vehicle1_id;
  ELSE
    SELECT id INTO v_vehicle1_id FROM vehicles WHERE created_by = v_user_id AND plate_number = '12345-A-6' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vehicles WHERE created_by = v_user_id AND plate_number = '78901-B-12') THEN
    INSERT INTO vehicles (plate_number, type, brand, model, capacity_tons, status, current_driver_id, fuel_level, next_maintenance_date, created_by)
    VALUES ('78901-B-12', 'Camion-plateau', 'Volvo', 'FH 460', 25, 'Disponible', v_driver2_id, 92, '2026-08-20', v_user_id)
    RETURNING id INTO v_vehicle2_id;
  ELSE
    SELECT id INTO v_vehicle2_id FROM vehicles WHERE created_by = v_user_id AND plate_number = '78901-B-12' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vehicles WHERE created_by = v_user_id AND plate_number = '45678-C-9') THEN
    INSERT INTO vehicles (plate_number, type, brand, model, capacity_tons, status, fuel_level, created_by)
    VALUES ('45678-C-9', 'Semi-remorque', 'Mercedes', 'Actros 2548', 35, 'Maintenance', 30, v_user_id);
  END IF;

  -- TRANSPORT ROUTES
  IF NOT EXISTS (SELECT 1 FROM transport_routes WHERE created_by = v_user_id AND name = 'Casablanca → Marrakech') THEN
    INSERT INTO transport_routes (name, origin_city, origin_lat, origin_lng, destination_city, destination_lat, destination_lng, distance_km, average_duration_hours, base_cost, created_by)
    VALUES ('Casablanca → Marrakech', 'Casablanca', 33.5731, -7.5898, 'Marrakech', 31.6295, -7.9811, 240, 3.5, 4500, v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM transport_routes WHERE created_by = v_user_id AND name = 'Casablanca → Tanger') THEN
    INSERT INTO transport_routes (name, origin_city, origin_lat, origin_lng, destination_city, destination_lat, destination_lng, distance_km, average_duration_hours, base_cost, created_by)
    VALUES ('Casablanca → Tanger', 'Casablanca', 33.5731, -7.5898, 'Tanger', 35.7595, -5.8340, 340, 4.5, 6200, v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM transport_routes WHERE created_by = v_user_id AND name = 'Casablanca → Agadir') THEN
    INSERT INTO transport_routes (name, origin_city, origin_lat, origin_lng, destination_city, destination_lat, destination_lng, distance_km, average_duration_hours, base_cost, created_by)
    VALUES ('Casablanca → Agadir', 'Casablanca', 33.5731, -7.5898, 'Agadir', 30.4278, -9.5981, 510, 6.0, 8800, v_user_id);
  END IF;

  -- DELIVERIES
  IF NOT EXISTS (SELECT 1 FROM deliveries WHERE created_by = v_user_id AND equipment_label = 'Pelle Caterpillar 320D' AND destination_address = 'Mine de Bouskoura, Casablanca') THEN
    INSERT INTO deliveries (
      equipment_label, driver_id, vehicle_id,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      pickup_date, expected_delivery_date,
      distance_km, transport_cost, status, priority, client_name, client_phone, created_by
    )
    VALUES (
      'Pelle Caterpillar 320D', v_driver1_id, v_vehicle1_id,
      'Dépôt Casablanca, Zone industrielle Sidi Bernoussi', 33.6245, -7.4940,
      'Mine de Bouskoura, Casablanca', 33.4584, -7.6492,
      NOW() - INTERVAL '2 hours', NOW() + INTERVAL '4 hours',
      45, 2800, 'En cours', 'Haute', 'OCP Bouskoura', '+212 522 67 89 00', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM deliveries WHERE created_by = v_user_id AND equipment_label = 'Bulldozer Komatsu D65' AND destination_address = 'Chantier Marrakech-Safi') THEN
    INSERT INTO deliveries (
      equipment_label, driver_id, vehicle_id,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      pickup_date, expected_delivery_date,
      distance_km, transport_cost, status, priority, client_name, client_phone, created_by
    )
    VALUES (
      'Bulldozer Komatsu D65', v_driver2_id, v_vehicle2_id,
      'Dépôt Casablanca, Zone industrielle Sidi Bernoussi', 33.6245, -7.4940,
      'Chantier Marrakech-Safi', 31.6295, -7.9811,
      NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 6 hours',
      240, 4500, 'Planifiée', 'Moyenne', 'BTP Atlas', '+212 524 33 22 11', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM deliveries WHERE created_by = v_user_id AND equipment_label = 'Chargeuse Volvo L120H' AND status = 'Livrée') THEN
    INSERT INTO deliveries (
      equipment_label,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      pickup_date, expected_delivery_date, actual_delivery_date,
      distance_km, transport_cost, status, priority, client_name, client_phone, created_by
    )
    VALUES (
      'Chargeuse Volvo L120H',
      'Dépôt Casablanca', 33.6245, -7.4940,
      'Carrière El Jadida', 33.2316, -8.5007,
      NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days 18 hours', NOW() - INTERVAL '2 days 16 hours',
      105, 3200, 'Livrée', 'Basse', 'Carrières du Doukkala', '+212 523 34 56 78', v_user_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM deliveries WHERE created_by = v_user_id AND equipment_label = 'Camion-benne Mercedes Arocs' AND status = 'Retardée') THEN
    INSERT INTO deliveries (
      equipment_label,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      pickup_date, expected_delivery_date,
      distance_km, transport_cost, status, priority, client_name, client_phone, notes, created_by
    )
    VALUES (
      'Camion-benne Mercedes Arocs',
      'Tanger Med', 35.8838, -5.5169,
      'Site Khouribga', 32.8811, -6.9063,
      NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour',
      420, 7500, 'Retardée', 'Urgente', 'OCP Khouribga', '+212 523 56 11 00',
      'Retard douane Tanger Med — chauffeur en attente', v_user_id
    );
  END IF;

  RAISE NOTICE 'Données de test transporteur créées/mises à jour pour user_id=%', v_user_id;
END $$;

-- =====================================================================
-- VÉRIFICATION FINALE
-- =====================================================================
DO $$
DECLARE
  v_drivers INT;
  v_vehicles INT;
  v_routes INT;
  v_deliveries INT;
BEGIN
  SELECT COUNT(*) INTO v_drivers FROM drivers;
  SELECT COUNT(*) INTO v_vehicles FROM vehicles;
  SELECT COUNT(*) INTO v_routes FROM transport_routes;
  SELECT COUNT(*) INTO v_deliveries FROM deliveries;
  RAISE NOTICE '✅ Transporteur déployé : % drivers, % vehicles, % routes, % deliveries',
    v_drivers, v_vehicles, v_routes, v_deliveries;
END $$;
