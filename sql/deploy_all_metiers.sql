-- ============================================================
-- DEPLOIEMENT COMBINE — toutes les tables metier (7 metiers)
-- Genere par concatenation des deploy_*.sql (idempotents).
-- A executer UNE FOIS dans Supabase SQL Editor.
-- ============================================================



-- ================== deploy_mecanicien.sql ==================
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


-- ================== deploy_transporteur.sql ==================
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


-- ================== deploy_transitaire.sql ==================
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


-- ================== deploy_logisticien.sql ==================
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


-- ================== deploy_investisseur.sql ==================
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


-- ================== deploy_courtier.sql ==================
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


-- ================== deploy_rentals_loueur.sql ==================
-- =====================================================
-- SCRIPT DE DÉPLOIEMENT — Tables Loueur d'Engins
-- À exécuter dans Supabase SQL Editor (Dashboard → SQL)
-- =====================================================

-- ==================== TABLE RENTALS ====================

CREATE TABLE IF NOT EXISTS rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    client_id UUID,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Confirmée',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_rentals_equipment ON rentals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_rentals_client ON rentals(client_id);
CREATE INDEX IF NOT EXISTS idx_rentals_created_by ON rentals(created_by);
CREATE INDEX IF NOT EXISTS idx_rentals_start_date ON rentals(start_date);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status);

ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rentals' AND policyname = 'rentals_select_auth') THEN
    CREATE POLICY rentals_select_auth ON rentals FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rentals' AND policyname = 'rentals_insert_own') THEN
    CREATE POLICY rentals_insert_own ON rentals FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rentals' AND policyname = 'rentals_update_own') THEN
    CREATE POLICY rentals_update_own ON rentals FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rentals' AND policyname = 'rentals_delete_own') THEN
    CREATE POLICY rentals_delete_own ON rentals FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;

-- ==================== TABLE INTERVENTIONS ====================

CREATE TABLE IF NOT EXISTS interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'Maintenance préventive',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'En attente',
    scheduled_date TIMESTAMPTZ,
    completed_date TIMESTAMPTZ,
    technician_name TEXT,
    cost DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_interventions_equipment ON interventions(equipment_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);

ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_select_auth') THEN
    CREATE POLICY interventions_select_auth ON interventions FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_insert_own') THEN
    CREATE POLICY interventions_insert_own ON interventions FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interventions' AND policyname = 'interventions_update_own') THEN
    CREATE POLICY interventions_update_own ON interventions FOR UPDATE USING (auth.uid() = created_by);
  END IF;
END $$;

-- ==================== DONNÉES DE TEST ====================
-- Les dates sont relatives à NOW() pour être toujours pertinentes.
-- Les données s'appuient sur des machines existantes et l'utilisateur connecté.

DO $$
DECLARE
    v_user_id UUID;
    v_machine_id UUID;
    v_client_id UUID;
BEGIN
    -- Récupérer le premier utilisateur auth
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'Aucun utilisateur trouvé — données de test non insérées';
        RETURN;
    END IF;

    -- Utiliser le même utilisateur comme client pour les données de test
    v_client_id := v_user_id;

    -- Location 1 : EN COURS (pelle)
    SELECT id INTO v_machine_id FROM machines
    WHERE (name ILIKE '%pelle%' OR name ILIKE '%excavat%' OR brand ILIKE '%CAT%')
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() - INTERVAL '3 days', NOW() + INTERVAL '12 days',
                15000.00, 'En cours', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Location 2 : CONFIRMÉE (chargeuse, dans 2 jours)
    SELECT id INTO v_machine_id FROM machines
    WHERE (name ILIKE '%chargeuse%' OR name ILIKE '%chargeur%' OR name ILIKE '%JCB%')
    AND id NOT IN (SELECT equipment_id FROM rentals WHERE equipment_id IS NOT NULL)
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() + INTERVAL '2 days', NOW() + INTERVAL '16 days',
                8500.00, 'Confirmée', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Location 3 : EN PRÉPARATION (bulldozer, dans 5 jours)
    SELECT id INTO v_machine_id FROM machines
    WHERE (name ILIKE '%bulldozer%' OR name ILIKE '%bouteur%' OR name ILIKE '%D6%')
    AND id NOT IN (SELECT equipment_id FROM rentals WHERE equipment_id IS NOT NULL)
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() + INTERVAL '5 days', NOW() + INTERVAL '20 days',
                22000.00, 'En préparation', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Location 4 : PRÊTE (grue, demain)
    SELECT id INTO v_machine_id FROM machines
    WHERE (name ILIKE '%grue%' OR name ILIKE '%crane%' OR name ILIKE '%liebherr%')
    AND id NOT IN (SELECT equipment_id FROM rentals WHERE equipment_id IS NOT NULL)
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() + INTERVAL '1 day', NOW() + INTERVAL '4 days',
                6000.00, 'Prête', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Location 5 : CONFIRMÉE (compacteur, dans 10 jours)
    SELECT id INTO v_machine_id FROM machines
    WHERE (name ILIKE '%compact%' OR name ILIKE '%rouleau%' OR name ILIKE '%bomag%')
    AND id NOT IN (SELECT equipment_id FROM rentals WHERE equipment_id IS NOT NULL)
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() + INTERVAL '10 days', NOW() + INTERVAL '30 days',
                12000.00, 'Confirmée', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Location 6 : TERMINÉE le mois dernier (pour calcul croissance CA)
    SELECT id INTO v_machine_id FROM machines LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() - INTERVAL '35 days', NOW() - INTERVAL '20 days',
                9500.00, 'Terminée', v_user_id)
        ON CONFLICT DO NOTHING;

        INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, created_by)
        VALUES (v_machine_id, v_client_id,
                NOW() - INTERVAL '28 days', NOW() - INTERVAL '14 days',
                7200.00, 'Terminée', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Intervention 1 : maintenance sur un engin
    SELECT id INTO v_machine_id FROM machines
    WHERE id NOT IN (SELECT equipment_id FROM rentals WHERE equipment_id IS NOT NULL AND status IN ('En cours', 'Confirmée', 'Prête', 'En préparation'))
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, technician_name, created_by)
        VALUES (v_machine_id, 'Maintenance préventive',
                'Vidange + remplacement filtres', 'En cours',
                NOW() + INTERVAL '1 day', 'Technicien Ahmed', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Intervention 2 : en attente
    SELECT id INTO v_machine_id FROM machines
    WHERE id NOT IN (SELECT equipment_id FROM rentals WHERE equipment_id IS NOT NULL AND status IN ('En cours', 'Confirmée', 'Prête', 'En préparation'))
    AND id NOT IN (SELECT equipment_id FROM interventions WHERE equipment_id IS NOT NULL)
    LIMIT 1;
    IF v_machine_id IS NOT NULL THEN
        INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, technician_name, created_by)
        VALUES (v_machine_id, 'Réparation',
                'Remplacement vérin hydraulique', 'En attente',
                NOW() + INTERVAL '3 days', 'Technicien Hassan', v_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'Données de test insérées avec succès pour user %', v_user_id;
END $$;

-- ==================== VÉRIFICATION ====================

SELECT 'rentals' AS table_name, COUNT(*) AS row_count FROM rentals
UNION ALL
SELECT 'interventions', COUNT(*) FROM interventions;

SELECT
    r.id,
    r.status,
    r.start_date::date AS debut,
    r.end_date::date AS fin,
    r.total_price,
    m.name AS equipement,
    r.client_id
FROM rentals r
LEFT JOIN machines m ON r.equipment_id = m.id
ORDER BY r.start_date;
