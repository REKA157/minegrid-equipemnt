-- =====================================================================
-- COÛT & RENTABILITÉ DES OPÉRATIONS (widget logisticien « Coût & rentabilité »)
-- Ajoute distance + coûts (transport, entreposage) + revenu facturé sur
-- logistics_route_tracking, puis seed sur le compte de test.
-- Marge = montant facturé - (coût transport + coût entreposage).
-- Idempotent. A exécuter dans Supabase SQL Editor.
-- RLS déjà en place sur logistics_route_tracking (auth.uid() = created_by).
-- =====================================================================

ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10,1) DEFAULT 0;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS transport_cost_mad NUMERIC(12,2) DEFAULT 0;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS warehousing_cost_mad NUMERIC(12,2) DEFAULT 0;
ALTER TABLE logistics_route_tracking ADD COLUMN IF NOT EXISTS invoiced_amount_mad NUMERIC(12,2) DEFAULT 0;

-- ============ SEED rentabilité (compte de test) ============
-- Les routes existantes (deploy_logisticien.sql) reçoivent des chiffres réalistes.

-- RT-CAS-0288 Tanger Med -> Fès : opération rentable (marge ~ +2 300 MAD).
UPDATE logistics_route_tracking
   SET distance_km = 300, transport_cost_mad = 6800, warehousing_cost_mad = 900, invoiced_amount_mad = 10000
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND route_ref = 'RT-CAS-0288';

-- RT-CAS-0291 Marrakech -> Casablanca (Retard) : NON rentable (pénalité retard, marge négative).
UPDATE logistics_route_tracking
   SET distance_km = 240, transport_cost_mad = 7200, warehousing_cost_mad = 1600, invoiced_amount_mad = 6500
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND route_ref = 'RT-CAS-0291';

-- RT-CAS-0295 Casablanca -> Nador : opération rentable (châssis projet, marge ~ +4 100 MAD).
UPDATE logistics_route_tracking
   SET distance_km = 560, transport_cost_mad = 12400, warehousing_cost_mad = 1500, invoiced_amount_mad = 18000
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND route_ref = 'RT-CAS-0295';

-- Opérations supplémentaires pour donner du volume au widget (dont une deuxième à perte).
INSERT INTO logistics_route_tracking (route_ref, vehicle_label, status, origin_label, dest_label, cargo_summary, distance_km, transport_cost_mad, warehousing_cost_mad, invoiced_amount_mad, created_by)
SELECT 'RT-CAS-0301', 'Mercedes Actros 1845', 'Livré', 'Casablanca', 'Agadir', 'Lots pièces moteur', 460, 9800, 1200, 8500, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_route_tracking
   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND route_ref = 'RT-CAS-0301'
);

INSERT INTO logistics_route_tracking (route_ref, vehicle_label, status, origin_label, dest_label, cargo_summary, distance_km, transport_cost_mad, warehousing_cost_mad, invoiced_amount_mad, created_by)
SELECT 'RT-CAS-0304', 'Volvo FH16', 'Livré', 'Tanger Med', 'Casablanca', 'Palettes CP filtres', 340, 7100, 1000, 12500, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_route_tracking
   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND route_ref = 'RT-CAS-0304'
);

DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM logistics_route_tracking
   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND invoiced_amount_mad > 0;
  RAISE NOTICE 'Rentabilité logisticien : % opérations chiffrées pour le compte de test', n;
END $$;