-- =====================================================================
-- RECOUVREMENT / IMPAYÉS DE LOCATION (widget loueur « Recouvrement / impayés »)
-- Crée la table rental_invoices (factures/échéances de loyer) — absente du schéma loueur.
-- Impayé = due_date < aujourd'hui ET (amount_due - amount_paid) > 0 ET statut non soldé.
-- Aging 0-30j / 31-60j / 60j+. Enjeu trésorerie n°1 du loueur d'engins.
-- RLS calquée sur rentals/interventions. Scope API : created_by OU equipment_id du parc.
-- Idempotent. À exécuter dans Supabase SQL Editor (après deploy_rentals_loueur + seed_machines_loueur).
-- =====================================================================

-- ==================== TABLE RENTAL_INVOICES ====================
CREATE TABLE IF NOT EXISTS rental_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_id UUID REFERENCES rentals(id) ON DELETE SET NULL,
    equipment_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    client_name TEXT,
    invoice_number TEXT,
    amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'Émise',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Colonnes ajoutées si la table préexistait dans une version antérieure
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS rental_id UUID REFERENCES rentals(id) ON DELETE SET NULL;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES machines(id) ON DELETE SET NULL;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Émise';
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE rental_invoices ADD COLUMN IF NOT EXISTS source TEXT; -- marqueur de seed idempotent

CREATE INDEX IF NOT EXISTS idx_rental_invoices_equipment ON rental_invoices(equipment_id);
CREATE INDEX IF NOT EXISTS idx_rental_invoices_created_by ON rental_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_rental_invoices_due_date ON rental_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_rental_invoices_status ON rental_invoices(status);

ALTER TABLE rental_invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rental_invoices' AND policyname = 'rental_invoices_select_auth') THEN
    CREATE POLICY rental_invoices_select_auth ON rental_invoices FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rental_invoices' AND policyname = 'rental_invoices_insert_own') THEN
    CREATE POLICY rental_invoices_insert_own ON rental_invoices FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rental_invoices' AND policyname = 'rental_invoices_update_own') THEN
    CREATE POLICY rental_invoices_update_own ON rental_invoices FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rental_invoices' AND policyname = 'rental_invoices_delete_own') THEN
    CREATE POLICY rental_invoices_delete_own ON rental_invoices FOR DELETE USING (auth.uid() = created_by);
  END IF;
END $$;

-- ==================== SEED (compte de test) ====================
-- L'API loueur scope par created_by = compte OU equipment_id dans le parc du compte.
-- On rattache aux engins du parc seedé (seed_machines_loueur.sql) et à created_by = compte.
-- Idempotent : purge par marqueur source='seed-demo-recouvrement'.
DELETE FROM rental_invoices WHERE source = 'seed-demo-recouvrement';

INSERT INTO rental_invoices
  (equipment_id, client_name, invoice_number, amount_due, amount_paid, due_date, status, created_by, source)
VALUES
  -- 60 j+ : gros débiteur, aucune relance aboutie (rouge)
  ('bbbbbbb1-0000-0000-0000-000000000007', 'BTP Atlas Construction', 'LOC-2026-0031', 96000, 0,     (NOW() - INTERVAL '78 days')::date, 'Émise',   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- 60 j+ : partiellement payée, reste dû élevé
  ('bbbbbbb1-0000-0000-0000-000000000004', 'Routes du Souss SARL',   'LOC-2026-0033', 54000, 18000, (NOW() - INTERVAL '64 days')::date, 'Partielle','a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- 31-60 j : orange
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Carrières Chaouia',      'LOC-2026-0040', 28500, 0,     (NOW() - INTERVAL '47 days')::date, 'Émise',   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- 31-60 j : amber/orange
  ('bbbbbbb1-0000-0000-0000-000000000003', 'Sogea Maroc',            'LOC-2026-0042', 41000, 0,     (NOW() - INTERVAL '35 days')::date, 'Relancée','a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- 0-30 j : premier retard, à relancer vite
  ('bbbbbbb1-0000-0000-0000-000000000005', 'TP Ouarzazate',          'LOC-2026-0048', 12500, 0,     (NOW() - INTERVAL '12 days')::date, 'Émise',   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- 0-30 j : petit reliquat
  ('bbbbbbb1-0000-0000-0000-000000000006', 'Ménara Prefa',           'LOC-2026-0050',  9000, 3000,  (NOW() - INTERVAL '5 days')::date,  'Partielle','a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- NON échue (échéance future) : ne doit PAS apparaître comme impayé -> contrôle honnêteté
  ('bbbbbbb1-0000-0000-0000-000000000002', 'Delta Travaux',          'LOC-2026-0052', 15000, 0,     (NOW() + INTERVAL '20 days')::date, 'Émise',   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement'),
  -- SOLDÉE : ne doit PAS apparaître -> contrôle statut
  ('bbbbbbb1-0000-0000-0000-000000000002', 'Ciments du Maroc',       'LOC-2026-0045', 22000, 22000, (NOW() - INTERVAL '10 days')::date, 'Soldée',  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'seed-demo-recouvrement');

-- ==================== VÉRIFICATION ====================
SELECT invoice_number, client_name, amount_due - amount_paid AS reste_du,
       (CURRENT_DATE - due_date) AS jours_retard, status
FROM rental_invoices
WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
ORDER BY due_date;