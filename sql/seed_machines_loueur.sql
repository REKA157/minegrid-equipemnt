-- =====================================================================
-- SEED PARC MACHINES — compte de test (widget « Disponibilité Équipements » du loueur)
-- Proprietaire : a7583ae2-53a3-4668-a4e0-0b12f9eca2f1 (sellerid + seller_id)
-- Le widget lit machines OU (sellerid/seller_id/user_id/owner_id = compte),
-- et croise avec rentals/interventions (equipment_id) pour Disponible/En location/Maintenance.
-- Idempotent : purge par marqueur source='seed-demo-loueur'.
-- A executer dans Supabase SQL Editor (apres deploy + seed metiers).
-- =====================================================================

-- Detache d'abord les liens vers ces machines (evite FK/incoherence au re-run)
UPDATE rentals       SET equipment_id = NULL WHERE equipment_id IN (SELECT id FROM machines WHERE source = 'seed-demo-loueur');
UPDATE interventions SET equipment_id = NULL WHERE equipment_id IN (SELECT id FROM machines WHERE source = 'seed-demo-loueur');
DELETE FROM machines WHERE source = 'seed-demo-loueur';

-- ============ PARC : 7 engins possedes par le compte de test ============
INSERT INTO machines (id, name, brand, model, category, year, price, condition, sellerid, seller_id, status, source, created_at)
VALUES
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Pelle CAT 320D',            'Caterpillar', '320D',        'Terrassement & Excavation', 2019, '620000',  'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '400 days'),
  ('bbbbbbb1-0000-0000-0000-000000000002', 'Chargeuse JCB 3CX',         'JCB',         '3CX',         'Terrassement & Excavation', 2020, '480000',  'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '380 days'),
  ('bbbbbbb1-0000-0000-0000-000000000003', 'Niveleuse CAT 12M',         'Caterpillar', '12M',         'Voirie & Compactage',       2017, '890000',  'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '520 days'),
  ('bbbbbbb1-0000-0000-0000-000000000004', 'Tombereau Volvo A25G',      'Volvo',       'A25G',        'Transport & Camions',       2018, '1350000', 'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '300 days'),
  ('bbbbbbb1-0000-0000-0000-000000000005', 'Compacteur Hamm 3410',      'Hamm',        '3410',        'Voirie & Compactage',       2021, '410000',  'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '220 days'),
  ('bbbbbbb1-0000-0000-0000-000000000006', 'Chargeuse Komatsu WA320',   'Komatsu',     'WA320',       'Terrassement & Excavation', 2019, '560000',  'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '260 days'),
  ('bbbbbbb1-0000-0000-0000-000000000007', 'Grue mobile Liebherr LTM 1050','Liebherr', 'LTM 1050',    'Levage & Manutention',      2016, '2100000', 'used', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', 'available', 'seed-demo-loueur', NOW() - INTERVAL '600 days');

-- ============ Varier les statuts : 2 « En location » + 1 « Maintenance » ============
-- 2 locations actives rattachees a 2 engins du parc -> statut « En location »
UPDATE rentals SET equipment_id = 'bbbbbbb1-0000-0000-0000-000000000001'
 WHERE id IN (SELECT id FROM rentals WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
              AND status IN ('En cours','Confirmée','Prête','En préparation') ORDER BY created_at LIMIT 1);
UPDATE rentals SET equipment_id = 'bbbbbbb1-0000-0000-0000-000000000003'
 WHERE id IN (SELECT id FROM rentals WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
              AND status IN ('En cours','Confirmée','Prête','En préparation')
              AND equipment_id IS DISTINCT FROM 'bbbbbbb1-0000-0000-0000-000000000001' ORDER BY created_at LIMIT 1);

-- 1 intervention active rattachee a un engin -> statut « Maintenance »
UPDATE interventions SET equipment_id = 'bbbbbbb1-0000-0000-0000-000000000005'
 WHERE id IN (SELECT id FROM interventions WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
              AND status IN ('En cours','En attente') ORDER BY created_at LIMIT 1);
