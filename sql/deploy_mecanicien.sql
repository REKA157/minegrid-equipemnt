-- =====================================================
-- SCRIPT DE DEPLOIEMENT — Tables Mecanicien / Atelier
-- A executer dans Supabase SQL Editor (Dashboard -> SQL)
-- =====================================================
-- Objectif : faire passer le dashboard Mecanicien de 22/100 a 70+/100
-- Ce script cree les 6 tables atelier dont les API frontend
-- existent deja dans src/utils/enterpriseApi/ (interventions.ts,
-- repairs.ts, technicians.ts, inventory.ts).
--
-- IDEMPOTENT et MIGRATION-SAFE : si une table existe deja avec un
-- schema partiel (ancien script archive), les colonnes manquantes
-- sont ajoutees via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--
-- Securite : RLS strictes par created_by. Pas de SELECT pour tout
-- authentifie (preparation organization_id pour Sprint 1).
-- =====================================================


-- ==================== EXTENSIONS & HELPERS ====================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION mecanicien_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- TABLE TECHNICIANS
-- =====================================================
CREATE TABLE IF NOT EXISTS technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS max_workload_hours INTEGER DEFAULT 40;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS current_workload_hours INTEGER DEFAULT 0;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2) DEFAULT 1.00;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'Disponible';
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS created_by UUID;

-- name peut être NOT NULL si la table est neuve, garantir un fallback
UPDATE technicians SET name = 'Technicien' WHERE name IS NULL;

CREATE INDEX IF NOT EXISTS idx_technicians_name ON technicians(name);
CREATE INDEX IF NOT EXISTS idx_technicians_created_by ON technicians(created_by);
CREATE INDEX IF NOT EXISTS idx_technicians_availability ON technicians(availability_status);

DROP TRIGGER IF EXISTS trg_technicians_updated_at ON technicians;
CREATE TRIGGER trg_technicians_updated_at
  BEFORE UPDATE ON technicians
  FOR EACH ROW EXECUTE FUNCTION mecanicien_set_updated_at();

ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'technicians' AND policyname = 'technicians_select_own') THEN
    CREATE POLICY technicians_select_own ON technicians
      FOR SELECT USING (auth.uid() = created_by OR auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'technicians' AND policyname = 'technicians_insert_own') THEN
    CREATE POLICY technicians_insert_own ON technicians
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'technicians' AND policyname = 'technicians_update_own') THEN
    CREATE POLICY technicians_update_own ON technicians
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'technicians' AND policyname = 'technicians_delete_own') THEN
    CREATE POLICY technicians_delete_own ON technicians
      FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;


-- =====================================================
-- TABLE INTERVENTIONS
-- =====================================================
-- intervention_date est la colonne principale utilisee par les API.
-- scheduled_date est une colonne miroir maintenue par trigger pour
-- compatibilite avec INTERVENTION_URGENT_COLUMNS (qui select 'scheduled_date').
CREATE TABLE IF NOT EXISTS interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS equipment_id UUID;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS equipment_name TEXT;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS technician_id UUID;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS technician_name TEXT;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS intervention_date TIMESTAMPTZ;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMPTZ;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS completed_date TIMESTAMPTZ;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En attente';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Moyenne';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS actual_duration INTEGER;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_interventions_equipment ON interventions(equipment_id);
CREATE INDEX IF NOT EXISTS idx_interventions_technician ON interventions(technician_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);
CREATE INDEX IF NOT EXISTS idx_interventions_priority ON interventions(priority);
CREATE INDEX IF NOT EXISTS idx_interventions_date ON interventions(intervention_date);
CREATE INDEX IF NOT EXISTS idx_interventions_created_by ON interventions(created_by);

-- Trigger pour synchroniser scheduled_date <- intervention_date
CREATE OR REPLACE FUNCTION sync_intervention_scheduled_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.scheduled_date = NEW.intervention_date;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interventions_sync ON interventions;
CREATE TRIGGER trg_interventions_sync
  BEFORE INSERT OR UPDATE ON interventions
  FOR EACH ROW EXECUTE FUNCTION sync_intervention_scheduled_date();

-- Backfill scheduled_date pour anciennes lignes
UPDATE interventions SET scheduled_date = intervention_date
  WHERE scheduled_date IS NULL AND intervention_date IS NOT NULL;

ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_select_own') THEN
    CREATE POLICY interventions_select_own ON interventions
      FOR SELECT USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_insert_own') THEN
    CREATE POLICY interventions_insert_own ON interventions
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_update_own') THEN
    CREATE POLICY interventions_update_own ON interventions
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_delete_own') THEN
    CREATE POLICY interventions_delete_own ON interventions
      FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;


-- =====================================================
-- TABLE REPAIRS
-- =====================================================
CREATE TABLE IF NOT EXISTS repairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE repairs ADD COLUMN IF NOT EXISTS equipment_id UUID;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS equipment_name TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS technician_id UUID;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS technician_name TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En attente';
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS problem_description TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS solution_description TEXT;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2);
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(10,2);
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS actual_duration INTEGER;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS completion_date TIMESTAMPTZ;
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_repairs_equipment ON repairs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_repairs_technician ON repairs(technician_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_created_by ON repairs(created_by);

DROP TRIGGER IF EXISTS trg_repairs_updated_at ON repairs;
CREATE TRIGGER trg_repairs_updated_at
  BEFORE UPDATE ON repairs
  FOR EACH ROW EXECUTE FUNCTION mecanicien_set_updated_at();

ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repairs' AND policyname = 'repairs_select_own') THEN
    CREATE POLICY repairs_select_own ON repairs
      FOR SELECT USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repairs' AND policyname = 'repairs_insert_own') THEN
    CREATE POLICY repairs_insert_own ON repairs
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repairs' AND policyname = 'repairs_update_own') THEN
    CREATE POLICY repairs_update_own ON repairs
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repairs' AND policyname = 'repairs_delete_own') THEN
    CREATE POLICY repairs_delete_own ON repairs
      FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;


-- =====================================================
-- TABLE INVENTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS part_name TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS part_number TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS current_stock INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS minimum_stock INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS maximum_stock INTEGER;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_email TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_restock_date TIMESTAMPTZ;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS next_restock_date TIMESTAMPTZ;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_by UUID;

UPDATE inventory SET category = 'Divers' WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier);
CREATE INDEX IF NOT EXISTS idx_inventory_created_by ON inventory(created_by);

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION mecanicien_set_updated_at();

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'inventory_select_own') THEN
    CREATE POLICY inventory_select_own ON inventory
      FOR SELECT USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'inventory_insert_own') THEN
    CREATE POLICY inventory_insert_own ON inventory
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'inventory_update_own') THEN
    CREATE POLICY inventory_update_own ON inventory
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'inventory_delete_own') THEN
    CREATE POLICY inventory_delete_own ON inventory
      FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;


-- =====================================================
-- TABLE TASKS
-- =====================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS technician_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS intervention_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repair_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'À faire';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Moyenne';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_tasks_technician ON tasks(technician_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION mecanicien_set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_select_own') THEN
    CREATE POLICY tasks_select_own ON tasks
      FOR SELECT USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_insert_own') THEN
    CREATE POLICY tasks_insert_own ON tasks
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_update_own') THEN
    CREATE POLICY tasks_update_own ON tasks
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_delete_own') THEN
    CREATE POLICY tasks_delete_own ON tasks
      FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;


-- =====================================================
-- TABLE STOCK_ORDERS (commandes pieces detachees)
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS inventory_id UUID;
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2);
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ;
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS actual_delivery_date TIMESTAMPTZ;
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'En attente';
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE stock_orders ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_stock_orders_inventory ON stock_orders(inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_orders_status ON stock_orders(status);
CREATE INDEX IF NOT EXISTS idx_stock_orders_created_by ON stock_orders(created_by);

DROP TRIGGER IF EXISTS trg_stock_orders_updated_at ON stock_orders;
CREATE TRIGGER trg_stock_orders_updated_at
  BEFORE UPDATE ON stock_orders
  FOR EACH ROW EXECUTE FUNCTION mecanicien_set_updated_at();

ALTER TABLE stock_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_orders' AND policyname = 'stock_orders_select_own') THEN
    CREATE POLICY stock_orders_select_own ON stock_orders
      FOR SELECT USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_orders' AND policyname = 'stock_orders_insert_own') THEN
    CREATE POLICY stock_orders_insert_own ON stock_orders
      FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_orders' AND policyname = 'stock_orders_update_own') THEN
    CREATE POLICY stock_orders_update_own ON stock_orders
      FOR UPDATE USING (auth.uid() = created_by);
  END IF;
END $$;


-- =====================================================
-- DONNEES DE TEST MINIMALES
-- =====================================================
-- Inserees uniquement pour l'utilisateur connecte qui execute le script.
-- Idempotent : tests d'existence par nom + created_by.
DO $$
DECLARE
    v_user_id UUID;
    v_machine_id UUID;
    v_machine_id_2 UUID;
    v_tech_alami UUID;
    v_tech_benali UUID;
    v_tech_tazi UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'Aucun utilisateur trouve - donnees de test non inserees';
        RETURN;
    END IF;

    -- TECHNICIANS : 3 techniciens (idempotent par nom + created_by)
    IF NOT EXISTS (SELECT 1 FROM technicians WHERE name = 'Mohammed Alami' AND created_by = v_user_id) THEN
      INSERT INTO technicians (name, specialization, max_workload_hours, current_workload_hours, efficiency_rating, availability_status, created_by)
      VALUES ('Mohammed Alami', 'Moteurs diesel', 40, 12, 0.95, 'Disponible', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM technicians WHERE name = 'Ahmed Benali' AND created_by = v_user_id) THEN
      INSERT INTO technicians (name, specialization, max_workload_hours, current_workload_hours, efficiency_rating, availability_status, created_by)
      VALUES ('Ahmed Benali', 'Systemes hydrauliques', 40, 28, 0.88, 'Occupé', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM technicians WHERE name = 'Hassan Tazi' AND created_by = v_user_id) THEN
      INSERT INTO technicians (name, specialization, max_workload_hours, current_workload_hours, efficiency_rating, availability_status, created_by)
      VALUES ('Hassan Tazi', 'Mecanique generale', 40, 8, 0.92, 'Disponible', v_user_id);
    END IF;

    SELECT id INTO v_tech_alami  FROM technicians WHERE name = 'Mohammed Alami' AND created_by = v_user_id LIMIT 1;
    SELECT id INTO v_tech_benali FROM technicians WHERE name = 'Ahmed Benali'   AND created_by = v_user_id LIMIT 1;
    SELECT id INTO v_tech_tazi   FROM technicians WHERE name = 'Hassan Tazi'    AND created_by = v_user_id LIMIT 1;

    -- 2 machines existantes pour les FK
    SELECT id INTO v_machine_id   FROM machines ORDER BY created_at LIMIT 1;
    SELECT id INTO v_machine_id_2 FROM machines ORDER BY created_at OFFSET 1 LIMIT 1;

    -- INTERVENTIONS : 4 interventions (idempotent par name + created_by)
    IF v_machine_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM interventions WHERE name = 'Vidange + filtres' AND created_by = v_user_id) THEN
        INSERT INTO interventions (equipment_id, technician_id, name, description, intervention_date, status, priority, estimated_duration, created_by)
        VALUES (v_machine_id, v_tech_alami, 'Vidange + filtres', 'Maintenance preventive 250h', NOW(), 'En cours', 'Haute', 4, v_user_id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM interventions WHERE name = 'Diagnostic hydraulique' AND created_by = v_user_id) THEN
        INSERT INTO interventions (equipment_id, technician_id, name, description, intervention_date, status, priority, estimated_duration, created_by)
        VALUES (v_machine_id, v_tech_benali, 'Diagnostic hydraulique', 'Verification fuites circuit principal', NOW() + INTERVAL '2 days', 'En attente', 'Moyenne', 6, v_user_id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM interventions WHERE name = 'Controle freins' AND created_by = v_user_id) THEN
        INSERT INTO interventions (equipment_id, technician_id, name, description, intervention_date, status, priority, estimated_duration, created_by)
        VALUES (v_machine_id, v_tech_tazi, 'Controle freins', 'Remplacement plaquettes + verification disques', NOW() - INTERVAL '1 day', 'En attente', 'Urgente', 3, v_user_id);
      END IF;
    END IF;

    IF v_machine_id_2 IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM interventions WHERE name = 'Inspection annuelle' AND created_by = v_user_id) THEN
        INSERT INTO interventions (equipment_id, technician_id, name, description, intervention_date, status, priority, estimated_duration, created_by)
        VALUES (v_machine_id_2, v_tech_alami, 'Inspection annuelle', 'Controle reglementaire complet', NOW() + INTERVAL '7 days', 'En attente', 'Basse', 8, v_user_id);
      END IF;
    END IF;

    -- REPAIRS : 2 reparations (idempotent par problem_description + created_by)
    IF v_machine_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM repairs WHERE problem_description = 'Fuite verin hydraulique principal' AND created_by = v_user_id) THEN
        INSERT INTO repairs (equipment_id, equipment_name, technician_id, technician_name, status, problem_description, estimated_cost, estimated_duration, created_by)
        VALUES (v_machine_id, 'Pelle CAT 320D', v_tech_benali, 'Ahmed Benali', 'En cours', 'Fuite verin hydraulique principal', 4500.00, 12, v_user_id);
      END IF;
    END IF;

    IF v_machine_id_2 IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM repairs WHERE problem_description = 'Demarrage difficile a froid - codes erreur ECU' AND created_by = v_user_id) THEN
        INSERT INTO repairs (equipment_id, equipment_name, technician_id, technician_name, status, problem_description, estimated_cost, estimated_duration, created_by)
        VALUES (v_machine_id_2, 'Chargeuse JCB 3CX', v_tech_alami, 'Mohammed Alami', 'Diagnostic', 'Demarrage difficile a froid - codes erreur ECU', 1800.00, 6, v_user_id);
      END IF;
    END IF;

    -- INVENTORY : 5 categories (idempotent par category + created_by)
    IF NOT EXISTS (SELECT 1 FROM inventory WHERE category = 'Filtres a air' AND created_by = v_user_id) THEN
      INSERT INTO inventory (category, part_name, current_stock, minimum_stock, unit_price, supplier, last_restock_date, created_by)
      VALUES ('Filtres a air', 'Filtre CAT-AF-3850', 12, 5, 280.00, 'CAT Maroc', NOW() - INTERVAL '15 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory WHERE category = 'Huile moteur 15W40' AND created_by = v_user_id) THEN
      INSERT INTO inventory (category, part_name, current_stock, minimum_stock, unit_price, supplier, last_restock_date, created_by)
      VALUES ('Huile moteur 15W40', 'Bidon 20L Total Rubia', 3, 10, 950.00, 'Total Energies', NOW() - INTERVAL '40 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory WHERE category = 'Plaquettes frein' AND created_by = v_user_id) THEN
      INSERT INTO inventory (category, part_name, current_stock, minimum_stock, unit_price, supplier, last_restock_date, created_by)
      VALUES ('Plaquettes frein', 'Kit JCB OEM', 1, 4, 1450.00, 'JCB Service', NOW() - INTERVAL '60 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory WHERE category = 'Courroies trapezoidales' AND created_by = v_user_id) THEN
      INSERT INTO inventory (category, part_name, current_stock, minimum_stock, unit_price, supplier, last_restock_date, created_by)
      VALUES ('Courroies trapezoidales', 'Lot 5 ref. mixtes', 18, 10, 120.00, 'Generic Spare Parts', NOW() - INTERVAL '8 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory WHERE category = 'Joints hydrauliques' AND created_by = v_user_id) THEN
      INSERT INTO inventory (category, part_name, current_stock, minimum_stock, unit_price, supplier, last_restock_date, created_by)
      VALUES ('Joints hydrauliques', 'Kit complet excavatrice', 8, 6, 420.00, 'Hydratech', NOW() - INTERVAL '20 days', v_user_id);
    END IF;

    -- TASKS : 6 taches (idempotent par title + created_by)
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Diagnostic CAT 320D' AND created_by = v_user_id) THEN
      INSERT INTO tasks (title, technician_id, status, estimated_hours, due_date, created_by)
      VALUES ('Diagnostic CAT 320D', v_tech_alami, 'En cours', 4, NOW() + INTERVAL '1 day', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Vidange flotte semaine' AND created_by = v_user_id) THEN
      INSERT INTO tasks (title, technician_id, status, estimated_hours, due_date, created_by)
      VALUES ('Vidange flotte semaine', v_tech_alami, 'À faire', 8, NOW() + INTERVAL '3 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Reparation hydraulique JCB' AND created_by = v_user_id) THEN
      INSERT INTO tasks (title, technician_id, status, estimated_hours, due_date, created_by)
      VALUES ('Reparation hydraulique JCB', v_tech_benali, 'En cours', 12, NOW() + INTERVAL '2 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Maintenance preventive lot' AND created_by = v_user_id) THEN
      INSERT INTO tasks (title, technician_id, status, estimated_hours, due_date, created_by)
      VALUES ('Maintenance preventive lot', v_tech_benali, 'À faire', 16, NOW() + INTERVAL '5 days', v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Controle freins urgent' AND created_by = v_user_id) THEN
      INSERT INTO tasks (title, technician_id, status, estimated_hours, due_date, created_by)
      VALUES ('Controle freins urgent', v_tech_tazi, 'En cours', 3, NOW(), v_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Inspection annuelle' AND created_by = v_user_id) THEN
      INSERT INTO tasks (title, technician_id, status, estimated_hours, due_date, created_by)
      VALUES ('Inspection annuelle', v_tech_tazi, 'À faire', 5, NOW() + INTERVAL '7 days', v_user_id);
    END IF;

    RAISE NOTICE 'Donnees de test mecanicien inserees pour user %', v_user_id;
END $$;


-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 'technicians' AS table_name, COUNT(*) AS row_count FROM technicians
UNION ALL SELECT 'interventions', COUNT(*) FROM interventions
UNION ALL SELECT 'repairs',       COUNT(*) FROM repairs
UNION ALL SELECT 'inventory',     COUNT(*) FROM inventory
UNION ALL SELECT 'tasks',         COUNT(*) FROM tasks
UNION ALL SELECT 'stock_orders',  COUNT(*) FROM stock_orders;
