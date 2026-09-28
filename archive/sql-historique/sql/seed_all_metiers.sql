-- ============================================================
-- SEED COMBINE — donnees de demo des 7 metiers
-- Scope RLS = compte de test a7583ae2-53a3-4668-a4e0-0b12f9eca2f1
-- A executer APRES deploy_all_metiers.sql, dans Supabase SQL Editor.
-- Idempotent (chaque bloc purge ses lignes de demo avant reinsertion).
-- ============================================================



-- ################## METIER: mecanicien (tables: technicians, interventions, repairs, inventory, tasks, stock_orders) ##################
-- =====================================================
-- SEED DE DEMONSTRATION — Metier MECANICIEN / ATELIER
-- A coller dans Supabase SQL Editor (Dashboard -> SQL)
-- Compte de test (proprietaire RLS = created_by) :
--   a7583ae2-53a3-4668-a4e0-0b12f9eca2f1
-- Contexte : atelier engins de chantier/mine, marche Maroc / Afrique de l'Ouest, montants en MAD
-- IDEMPOTENT : chaque table est purgee pour cet uid avant reinsertion => rejouable a volonte.
-- NB : les statuts/priorites reprennent EXACTEMENT les valeurs TEXT utilisees par le deploy
--      (aucun CHECK/enum contraignant dans le schema). Le trigger interventions synchronise
--      scheduled_date <- intervention_date automatiquement (ne pas l'inserer a la main).
-- =====================================================

-- Identifiants UUID fixes des techniciens (reutilises comme FK dans interventions/repairs/tasks)
--   Alami  = 11111111-1111-1111-1111-111111111111
--   Benali = 22222222-2222-2222-2222-222222222222
--   Tazi   = 33333333-3333-3333-3333-333333333333
--   Ouedraogo = 44444444-4444-4444-4444-444444444444 (Afrique de l'Ouest)
-- Identifiants UUID fixes de l'inventaire (reutilises comme FK dans stock_orders)
--   Filtre air  = aaaaaaa1-0000-0000-0000-000000000001
--   Huile 15W40 = aaaaaaa1-0000-0000-0000-000000000002  (sous seuil -> alerte)
--   Plaquettes  = aaaaaaa1-0000-0000-0000-000000000003  (sous seuil -> alerte)
--   Courroies   = aaaaaaa1-0000-0000-0000-000000000004
--   Joints hyd. = aaaaaaa1-0000-0000-0000-000000000005
--   Injecteurs  = aaaaaaa1-0000-0000-0000-000000000006  (rupture -> alerte)
--   Batteries   = aaaaaaa1-0000-0000-0000-000000000007

-- ============ NETTOYAGE (idempotence) ============
DELETE FROM stock_orders  WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM tasks         WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM repairs       WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM interventions WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM inventory     WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM technicians   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';


-- ============ TECHNICIANS (4 techniciens : charges/dispos variees) ============
-- 'Occupé' quasi sature (Benali) pour un widget de charge parlant.
INSERT INTO technicians
  (id, name, specialization, phone, email, max_workload_hours, current_workload_hours, efficiency_rating, availability_status, created_by, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Mohammed Alami',    'Moteurs diesel',        '+212 661-203145', 'm.alami@atelier-minegrid.ma',    40, 14, 0.95, 'Disponible', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '90 days'),
  ('22222222-2222-2222-2222-222222222222', 'Ahmed Benali',      'Systemes hydrauliques', '+212 662-887410', 'a.benali@atelier-minegrid.ma',   40, 37, 0.88, 'Occupé',     'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '75 days'),
  ('33333333-3333-3333-3333-333333333333', 'Hassan Tazi',       'Mecanique generale',    '+212 667-554120', 'h.tazi@atelier-minegrid.ma',     40, 9,  0.92, 'Disponible', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '60 days'),
  ('44444444-4444-4444-4444-444444444444', 'Ibrahim Ouedraogo', 'Transmission & pneus',  '+226 70-451288',  'i.ouedraogo@atelier-minegrid.ma',40, 22, 0.90, 'Occupé',     'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '45 days');


-- ============ INVENTORY (7 pieces ; 3 sous seuil pour declencher les alertes stock) ============
-- ALERTES : Huile 15W40 (3<10), Plaquettes JCB (1<4), Injecteurs CAT (0<3 -> rupture).
INSERT INTO inventory
  (id, part_name, part_number, category, current_stock, minimum_stock, maximum_stock, unit_price, supplier, supplier_email, location, last_restock_date, next_restock_date, created_by, created_at)
VALUES
  ('aaaaaaa1-0000-0000-0000-000000000001', 'Filtre a air CAT AF-3850',        'CAT-AF-3850',  'Filtres a air',            12, 5,  30, 280.00,  'CAT Maroc',           'pieces@catmaroc.ma',      'Rayon A-01', NOW() - INTERVAL '15 days', NOW() + INTERVAL '45 days', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '80 days'),
  ('aaaaaaa1-0000-0000-0000-000000000002', 'Huile moteur Total Rubia 15W40 20L','TR-15W40-20L','Huile moteur 15W40',        3, 10, 40, 950.00,  'Total Energies Maroc','commande@totalenergies.ma','Rayon B-04', NOW() - INTERVAL '40 days', NOW() + INTERVAL '3 days',  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '85 days'),
  ('aaaaaaa1-0000-0000-0000-000000000003', 'Kit plaquettes frein JCB OEM',     'JCB-BRK-3CX',  'Plaquettes frein',          1, 4,  15, 1450.00, 'JCB Service Casablanca','sav@jcb-casa.ma',        'Rayon C-02', NOW() - INTERVAL '60 days', NOW() + INTERVAL '5 days',  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '70 days'),
  ('aaaaaaa1-0000-0000-0000-000000000004', 'Lot courroies trapezoidales (x5)', 'BELT-MIX-5',   'Courroies trapezoidales',  18, 10, 50, 120.00,  'Generic Spare Parts', 'sales@genericspare.ma',   'Rayon A-07', NOW() - INTERVAL '8 days',  NOW() + INTERVAL '60 days', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '50 days'),
  ('aaaaaaa1-0000-0000-0000-000000000005', 'Kit joints hydrauliques excavatrice','HYD-SEAL-EXC','Joints hydrauliques',      8, 6,  25, 420.00,  'Hydratech Maroc',     'contact@hydratech.ma',    'Rayon C-05', NOW() - INTERVAL '20 days', NOW() + INTERVAL '30 days', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '65 days'),
  ('aaaaaaa1-0000-0000-0000-000000000006', 'Injecteur CAT C7 reconditionne',   'CAT-INJ-C7',   'Injection diesel',          0, 3,  12, 3200.00, 'CAT Maroc',           'pieces@catmaroc.ma',      'Rayon D-01', NOW() - INTERVAL '95 days', NOW() + INTERVAL '10 days', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '95 days'),
  ('aaaaaaa1-0000-0000-0000-000000000007', 'Batterie 12V 180Ah heavy duty',    'BAT-180AH',    'Batteries',                 6, 4,  20, 1650.00, 'Electra Auto Rabat',  'ventes@electra-auto.ma',  'Rayon B-09', NOW() - INTERVAL '12 days', NOW() + INTERVAL '50 days', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '55 days');


-- ============ INTERVENTIONS (6 ; statuts + dates variees, dont ce mois-ci) ============
-- scheduled_date est renseigne automatiquement par le trigger a partir de intervention_date.
-- 1 intervention 'Urgente' + 1 en retard (date passee, statut 'En attente') pour widget alertes.
INSERT INTO interventions
  (equipment_name, technician_id, technician_name, name, description, intervention_date, completed_date, status, priority, estimated_duration, actual_duration, created_by, created_at)
VALUES
  ('Pelle CAT 320D',          '11111111-1111-1111-1111-111111111111', 'Mohammed Alami',    'Vidange + filtres 250h',     'Maintenance preventive 250h (huile + filtres air/carburant)', NOW(),                       NULL,                        'En cours',   'Haute',   4, NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Chargeuse JCB 3CX',       '22222222-2222-2222-2222-222222222222', 'Ahmed Benali',      'Diagnostic hydraulique',     'Verification fuites circuit hydraulique principal',           NOW() + INTERVAL '2 days',   NULL,                        'En attente', 'Moyenne', 6, NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '2 days'),
  ('Tombereau Volvo A25G',    '33333333-3333-3333-3333-333333333333', 'Hassan Tazi',       'Controle freins',            'Remplacement plaquettes + verification disques (URGENT)',     NOW() - INTERVAL '1 day',    NULL,                        'En attente', 'Urgente', 3, NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '3 days'),
  ('Bulldozer CAT D6',        '44444444-4444-4444-4444-444444444444', 'Ibrahim Ouedraogo', 'Inspection annuelle',        'Controle reglementaire complet + train de roulement',         NOW() + INTERVAL '7 days',   NULL,                        'En attente', 'Basse',   8, NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '4 days'),
  ('Pelle CAT 320D',          '11111111-1111-1111-1111-111111111111', 'Mohammed Alami',    'Remplacement injecteurs',    'Depose/repose injecteurs C7 apres codes ECU',                 NOW() - INTERVAL '10 days',  NOW() - INTERVAL '8 days',   'Termine',    'Haute',   10, 11, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '12 days'),
  ('Niveleuse Komatsu GD535', '33333333-3333-3333-3333-333333333333', 'Hassan Tazi',       'Graissage general flotte',   'Graissage points articulation + verif niveaux',               NOW() - INTERVAL '20 days',  NOW() - INTERVAL '20 days',  'Termine',    'Moyenne', 5,  4, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '22 days');


-- ============ REPAIRS (6 ; couts en MAD, statuts + dates variees) ============
INSERT INTO repairs
  (equipment_name, technician_id, technician_name, status, problem_description, solution_description, estimated_cost, actual_cost, estimated_duration, actual_duration, start_date, completion_date, created_by, created_at)
VALUES
  ('Pelle CAT 320D',          '22222222-2222-2222-2222-222222222222', 'Ahmed Benali',      'En cours',    'Fuite verin hydraulique principal',                    NULL,                                        4500.00, NULL,    12, NULL, NOW() - INTERVAL '2 days',  NULL,                        'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '2 days'),
  ('Chargeuse JCB 3CX',       '11111111-1111-1111-1111-111111111111', 'Mohammed Alami',    'Diagnostic', 'Demarrage difficile a froid - codes erreur ECU',        NULL,                                        1800.00, NULL,     6, NULL, NOW() - INTERVAL '1 day',   NULL,                        'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Tombereau Volvo A25G',    '33333333-3333-3333-3333-333333333333', 'Hassan Tazi',       'En attente', 'Usure prematuree plaquettes essieu arriere',            NULL,                                        2600.00, NULL,     5, NULL, NULL,                        NULL,                        'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '3 days'),
  ('Bulldozer CAT D6',        '44444444-4444-4444-4444-444444444444', 'Ibrahim Ouedraogo', 'Termine',    'Rupture chenille cote gauche',                          'Remplacement maillon + retension chenille', 8900.00, 9350.00, 16, 18,  NOW() - INTERVAL '14 days', NOW() - INTERVAL '11 days',  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '15 days'),
  ('Pelle CAT 320D',          '11111111-1111-1111-1111-111111111111', 'Mohammed Alami',    'Termine',    'Perte de puissance moteur - injecteurs HS',             'Remplacement 2 injecteurs reconditionnes',  7200.00, 6980.00, 10, 11,  NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days',   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '12 days'),
  ('Niveleuse Komatsu GD535', '22222222-2222-2222-2222-222222222222', 'Ahmed Benali',      'Termine',    'Surchauffe circuit hydraulique',                        'Remplacement radiateur + purge circuit',    5400.00, 5150.00,  8,  7,  NOW() - INTERVAL '25 days', NOW() - INTERVAL '23 days',  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '26 days');


-- ============ TASKS (7 ; statuts + echeances variees, dont 1 due aujourd'hui) ============
INSERT INTO tasks
  (title, description, technician_id, status, priority, estimated_hours, actual_hours, start_date, due_date, completed_date, created_by, created_at)
VALUES
  ('Diagnostic CAT 320D',            'Lecture codes ECU + test compression',        '11111111-1111-1111-1111-111111111111', 'En cours', 'Haute',   4,  NULL, NOW() - INTERVAL '1 day',  NOW() + INTERVAL '1 day', NULL,                       'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Vidange flotte semaine',         'Vidange programmee 3 engins de chantier',     '11111111-1111-1111-1111-111111111111', 'À faire',  'Moyenne', 8,  NULL, NULL,                      NOW() + INTERVAL '3 days', NULL,                      'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Reparation hydraulique JCB',     'Remplacement joints + remise en pression',    '22222222-2222-2222-2222-222222222222', 'En cours', 'Haute',   12, NULL, NOW() - INTERVAL '1 day',  NOW() + INTERVAL '2 days', NULL,                      'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '2 days'),
  ('Maintenance preventive lot',     'Plan maintenance 500h sur 4 machines',        '44444444-4444-4444-4444-444444444444', 'À faire',  'Moyenne', 16, NULL, NULL,                      NOW() + INTERVAL '5 days', NULL,                      'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Controle freins urgent',         'Intervention urgente tombereau Volvo',        '33333333-3333-3333-3333-333333333333', 'En cours', 'Urgente', 3,  NULL, NOW(),                     NOW(),                     NULL,                      'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Inspection annuelle bulldozer',  'Preparation controle reglementaire',          '44444444-4444-4444-4444-444444444444', 'À faire',  'Basse',   5,  NULL, NULL,                      NOW() + INTERVAL '7 days', NULL,                      'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('Remplacement injecteurs CAT',    'Depose/repose injecteurs C7',                 '11111111-1111-1111-1111-111111111111', 'Termine',  'Haute',   10, 11,   NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '12 days');


-- ============ STOCK_ORDERS (6 ; commandes pieces detachees, MAD) ============
-- Liees a l'inventaire ; 1 commande urgente pour injecteurs en rupture + 1 pour huile sous seuil.
-- total_price = quantity * unit_price.
INSERT INTO stock_orders
  (inventory_id, quantity, unit_price, total_price, supplier, order_date, expected_delivery_date, actual_delivery_date, status, created_by, created_at)
VALUES
  ('aaaaaaa1-0000-0000-0000-000000000006', 3,  3200.00, 9600.00,  'CAT Maroc',            NOW() - INTERVAL '2 days',  NOW() + INTERVAL '8 days',  NULL,                       'En attente', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '2 days'),
  ('aaaaaaa1-0000-0000-0000-000000000002', 12, 950.00,  11400.00, 'Total Energies Maroc', NOW() - INTERVAL '1 day',   NOW() + INTERVAL '3 days',  NULL,                       'En attente', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '1 day'),
  ('aaaaaaa1-0000-0000-0000-000000000003', 6,  1450.00, 8700.00,  'JCB Service Casablanca',NOW() - INTERVAL '5 days', NOW() + INTERVAL '5 days',  NULL,                       'Commandee',  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '5 days'),
  ('aaaaaaa1-0000-0000-0000-000000000001', 20, 280.00,  5600.00,  'CAT Maroc',            NOW() - INTERVAL '12 days', NOW() - INTERVAL '2 days',  NOW() - INTERVAL '3 days',  'Livree',     'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '12 days'),
  ('aaaaaaa1-0000-0000-0000-000000000005', 15, 420.00,  6300.00,  'Hydratech Maroc',      NOW() - INTERVAL '18 days', NOW() - INTERVAL '8 days',  NOW() - INTERVAL '9 days',  'Livree',     'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '18 days'),
  ('aaaaaaa1-0000-0000-0000-000000000007', 10, 1650.00, 16500.00, 'Electra Auto Rabat',   NOW() - INTERVAL '30 days', NOW() - INTERVAL '22 days', NOW() - INTERVAL '21 days', 'Livree',     'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', NOW() - INTERVAL '30 days');


-- ============ VERIFICATION (comptes par table pour l'uid de test) ============
SELECT 'technicians'   AS table_name, COUNT(*) AS n FROM technicians   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
UNION ALL SELECT 'interventions', COUNT(*) FROM interventions WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
UNION ALL SELECT 'repairs',       COUNT(*) FROM repairs       WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
UNION ALL SELECT 'inventory',     COUNT(*) FROM inventory     WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
UNION ALL SELECT 'tasks',         COUNT(*) FROM tasks         WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
UNION ALL SELECT 'stock_orders',  COUNT(*) FROM stock_orders  WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';


-- ################## METIER: transporteur (tables: drivers, vehicles, transport_routes, deliveries) ##################
-- =====================================================================
-- SEED DE DEMONSTRATION — METIER TRANSPORTEUR
-- Marche Maroc / Afrique de l'Ouest — engins de chantier & mine, MAD
-- Compte de test (owner) : a7583ae2-53a3-4668-a4e0-0b12f9eca2f1
-- A coller dans Supabase SQL Editor. Idempotent (DELETE + INSERT).
-- Ordre : drivers -> vehicles -> transport_routes -> deliveries
--         (respect des cles etrangeres)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) NETTOYAGE DES LIGNES DE DEMO DE CET UID (ordre inverse des FK)
-- ---------------------------------------------------------------------
DELETE FROM deliveries       WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM vehicles         WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM transport_routes WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM drivers          WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';

-- ---------------------------------------------------------------------
-- 1) DRIVERS (chauffeurs) — 6 lignes
--    availability_status IN ('Disponible','En mission','En congé','Indisponible')
--    ALERTE permis : Mehdi Tazi = license_expiry dans ~10 jours (expiration proche)
-- ---------------------------------------------------------------------
INSERT INTO drivers
  (id, name, phone, email, license_number, license_expiry, availability_status,
   current_lat, current_lng, last_location_update, notes, created_by, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'Hassan El Amrani', '+212 6 12 34 56 78', 'h.elamrani@translog.ma', 'MA-2018-44521', (now() + interval '14 months')::date, 'En mission',   33.573100, -7.589800, now() - interval '15 minutes', 'Specialiste convois porte-engins',            'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '9 months'),
  ('11111111-1111-1111-1111-111111111102', 'Karim Benali',     '+212 6 87 65 43 21', 'k.benali@translog.ma',   'MA-2019-78214', (now() + interval '9 months')::date,  'Disponible',   31.629500, -7.981100, now() - interval '2 hours',   'Habilite matieres dangereuses',                'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '7 months'),
  ('11111111-1111-1111-1111-111111111103', 'Mehdi Tazi',       '+212 6 55 44 33 22', NULL,                     'MA-2020-11587', (now() + interval '10 days')::date,   'En congé',     NULL,       NULL,      NULL,                          'ALERTE : permis a renouveler sous 10 jours',    'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '6 months'),
  ('11111111-1111-1111-1111-111111111104', 'Youssef Ait Baha', '+212 6 61 22 88 44', 'y.aitbaha@translog.ma',  'MA-2017-30298', (now() + interval '20 months')::date, 'En mission',   35.759500, -5.834000, now() - interval '40 minutes', 'Ligne Nord (Tanger Med)',                     'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '5 months'),
  ('11111111-1111-1111-1111-111111111105', 'Abdou Diallo',     '+221 77 123 45 67',  'a.diallo@translog.ma',   'SN-2019-55012', (now() + interval '16 months')::date, 'Disponible',   14.716700, -17.467700, now() - interval '5 hours',   'Base Dakar — corridor Senegal / Mali',        'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '3 months'),
  ('11111111-1111-1111-1111-111111111106', 'Rachid Ouahbi',    '+212 6 44 77 11 33', NULL,                     'MA-2021-90733', (now() + interval '28 months')::date, 'Indisponible', NULL,       NULL,      NULL,                          'Arret maladie',                                'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '2 months');

-- ---------------------------------------------------------------------
-- 2) VEHICLES (vehicules) — 6 lignes
--    type IN ('Camion-plateau','Porte-engins','Semi-remorque','Utilitaire','Convoi exceptionnel')
--    status IN ('Disponible','En mission','Maintenance','Hors service')
--    fuel_level BETWEEN 0 AND 100
--    ALERTES : 45678-C-9 = maintenance en retard (next_maintenance_date passee)
--              22334-E-3 = carburant tres bas (fuel_level = 8)
-- ---------------------------------------------------------------------
INSERT INTO vehicles
  (id, plate_number, type, brand, model, capacity_tons, status, current_driver_id,
   current_lat, current_lng, last_location_update, fuel_level, next_maintenance_date, created_by, created_at)
VALUES
  ('22222222-2222-2222-2222-222222222201', '12345-A-6',  'Porte-engins',        'Renault',  'T High 520',   40.00, 'En mission',   '11111111-1111-1111-1111-111111111101', 33.573100, -7.589800, now() - interval '15 minutes', 65, (now() + interval '20 days')::date, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '9 months'),
  ('22222222-2222-2222-2222-222222222202', '78901-B-12', 'Camion-plateau',      'Volvo',    'FH 460',       25.00, 'Disponible',   '11111111-1111-1111-1111-111111111102', 31.629500, -7.981100, now() - interval '2 hours',   92, (now() + interval '2 months')::date, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '8 months'),
  ('22222222-2222-2222-2222-222222222203', '45678-C-9',  'Semi-remorque',       'Mercedes', 'Actros 2548',  35.00, 'Maintenance',  NULL,                                   NULL,      NULL,      NULL,                          30, (now() - interval '8 days')::date,  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '7 months'),
  ('22222222-2222-2222-2222-222222222204', '33221-D-7',  'Convoi exceptionnel', 'Scania',   'R 730',        60.00, 'En mission',   '11111111-1111-1111-1111-111111111104', 35.759500, -5.834000, now() - interval '40 minutes', 48, (now() + interval '35 days')::date, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '5 months'),
  ('22222222-2222-2222-2222-222222222205', '22334-E-3',  'Camion-plateau',      'MAN',      'TGS 33.480',   28.00, 'Disponible',   '11111111-1111-1111-1111-111111111105', 14.716700, -17.467700, now() - interval '5 hours',    8, (now() + interval '3 months')::date, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '3 months'),
  ('22222222-2222-2222-2222-222222222206', '99887-F-1',  'Utilitaire',          'Iveco',    'Daily 35C',     3.50, 'Hors service', NULL,                                   NULL,      NULL,      NULL,                          15, (now() - interval '2 days')::date,  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '1 month');

-- ---------------------------------------------------------------------
-- 3) TRANSPORT_ROUTES (referentiel routes) — 6 lignes
--    base_cost en MAD
-- ---------------------------------------------------------------------
INSERT INTO transport_routes
  (id, name, origin_city, origin_lat, origin_lng, destination_city, destination_lat, destination_lng,
   distance_km, average_duration_hours, base_cost, notes, created_by, created_at)
VALUES
  ('33333333-3333-3333-3333-333333333301', 'Casablanca -> Marrakech',   'Casablanca', 33.573100, -7.589800, 'Marrakech',  31.629500, -7.981100, 240.00,  3.50,  4500.00,  'Axe autoroute A7',                        'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '9 months'),
  ('33333333-3333-3333-3333-333333333302', 'Casablanca -> Tanger',      'Casablanca', 33.573100, -7.589800, 'Tanger',     35.759500, -5.834000, 340.00,  4.50,  6200.00,  'Livraisons port Tanger Med',              'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '8 months'),
  ('33333333-3333-3333-3333-333333333303', 'Casablanca -> Agadir',      'Casablanca', 33.573100, -7.589800, 'Agadir',     30.427800, -9.598100, 510.00,  6.00,  8800.00,  'Convois vers chantiers Souss',            'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '6 months'),
  ('33333333-3333-3333-3333-333333333304', 'Tanger Med -> Khouribga',   'Tanger',     35.883800, -5.516900, 'Khouribga',  32.881100, -6.906300, 420.00,  5.50,  7500.00,  'Logistique miniere OCP',                  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '4 months'),
  ('33333333-3333-3333-3333-333333333305', 'Casablanca -> El Jadida',   'Casablanca', 33.573100, -7.589800, 'El Jadida',  33.231600, -8.500700, 105.00,  1.50,  3200.00,  'Carrieres du Doukkala',                   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '3 months'),
  ('33333333-3333-3333-3333-333333333306', 'Dakar -> Bamako',           'Dakar',      14.716700, -17.467700, 'Bamako',    12.639200, -8.002900, 1230.00, 22.00, 145000.00, 'Corridor CEDEAO — transport transfront.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '2 months');

-- ---------------------------------------------------------------------
-- 4) DELIVERIES (livraisons / missions) — 7 lignes
--    status IN ('Planifiée','En cours','Livrée','Retardée','Annulée')
--    priority IN ('Basse','Moyenne','Haute','Urgente')
--    transport_cost en MAD
--    Varie les dates : livraisons ce mois-ci, recentes, planifiees, en retard.
--    ALERTE : livraison 'Retardée' avec expected_delivery_date deja passee.
-- ---------------------------------------------------------------------
INSERT INTO deliveries
  (id, equipment_label, driver_id, vehicle_id, route_id,
   origin_address, origin_lat, origin_lng,
   destination_address, destination_lat, destination_lng,
   pickup_date, expected_delivery_date, actual_delivery_date,
   distance_km, transport_cost, status, priority,
   client_name, client_phone, notes, created_by, created_at)
VALUES
  -- En cours (aujourd'hui)
  ('44444444-4444-4444-4444-444444444401', 'Pelle hydraulique Caterpillar 320D',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333305',
   'Depot Casablanca, Zone industrielle Sidi Bernoussi', 33.624500, -7.494000,
   'Mine de Bouskoura, Casablanca', 33.458400, -7.649200,
   now() - interval '2 hours', now() + interval '4 hours', NULL,
   45.00, 2800.00, 'En cours', 'Haute',
   'OCP Bouskoura', '+212 522 67 89 00', NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '1 day'),

  -- Planifiee (demain)
  ('44444444-4444-4444-4444-444444444402', 'Bulldozer Komatsu D65',
   '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333301',
   'Depot Casablanca, Zone industrielle Sidi Bernoussi', 33.624500, -7.494000,
   'Chantier Marrakech-Safi', 31.629500, -7.981100,
   now() + interval '1 day', now() + interval '1 day 6 hours', NULL,
   240.00, 4500.00, 'Planifiée', 'Moyenne',
   'BTP Atlas', '+212 524 33 22 11', NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '2 days'),

  -- Livree (ce mois-ci, il y a quelques jours)
  ('44444444-4444-4444-4444-444444444403', 'Chargeuse sur pneus Volvo L120H',
   NULL, NULL, '33333333-3333-3333-3333-333333333305',
   'Depot Casablanca', 33.624500, -7.494000,
   'Carriere El Jadida', 33.231600, -8.500700,
   now() - interval '3 days', now() - interval '2 days 18 hours', now() - interval '2 days 16 hours',
   105.00, 3200.00, 'Livrée', 'Basse',
   'Carrieres du Doukkala', '+212 523 34 56 78', NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '3 days'),

  -- ALERTE : Retardee, echeance depassee
  ('44444444-4444-4444-4444-444444444404', 'Camion-benne articule Mercedes Arocs',
   '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222204', '33333333-3333-3333-3333-333333333304',
   'Tanger Med', 35.883800, -5.516900,
   'Site minier Khouribga', 32.881100, -6.906300,
   now() - interval '6 hours', now() - interval '1 hour', NULL,
   420.00, 7500.00, 'Retardée', 'Urgente',
   'OCP Khouribga', '+212 523 56 11 00', 'ALERTE : retard douane Tanger Med — chauffeur en attente', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '8 hours'),

  -- Livree (plus tot ce mois-ci)
  ('44444444-4444-4444-4444-444444444405', 'Niveleuse Caterpillar 140K',
   '11111111-1111-1111-1111-111111111105', '22222222-2222-2222-2222-222222222205', '33333333-3333-3333-3333-333333333306',
   'Port autonome de Dakar', 14.673200, -17.428000,
   'Chantier route Bamako', 12.639200, -8.002900,
   now() - interval '20 days', now() - interval '18 days', now() - interval '18 days 4 hours',
   1230.00, 145000.00, 'Livrée', 'Haute',
   'Mines du Sahel SA', '+223 20 22 44 66', 'Passage frontiere Kidira OK', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '21 days'),

  -- Planifiee (dans quelques jours)
  ('44444444-4444-4444-4444-444444444406', 'Compacteur Bomag BW 213',
   '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333303',
   'Depot Casablanca, Zone industrielle Sidi Bernoussi', 33.624500, -7.494000,
   'Chantier autoroute Agadir', 30.427800, -9.598100,
   now() + interval '3 days', now() + interval '3 days 6 hours', NULL,
   510.00, 8800.00, 'Planifiée', 'Moyenne',
   'Souss Travaux Publics', '+212 528 84 12 90', NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '12 hours'),

  -- Annulee (ce mois-ci)
  ('44444444-4444-4444-4444-444444444407', 'Foreuse Atlas Copco ROC L8',
   NULL, NULL, '33333333-3333-3333-3333-333333333302',
   'Depot Casablanca', 33.624500, -7.494000,
   'Carriere Tetouan', 35.577700, -5.368500,
   now() - interval '5 days', now() - interval '4 days', NULL,
   340.00, 6200.00, 'Annulée', 'Basse',
   'Granulats du Nord', '+212 539 97 45 32', 'Annulee par le client — report indefini', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '6 days');

-- =====================================================================
-- FIN DU SEED — 6 drivers, 6 vehicles, 6 routes, 7 deliveries
-- =====================================================================


-- ################## METIER: transitaire (tables: customs_declarations, freight_containers, freight_monthly_volumes, freight_documents) ##################
-- =====================================================================
-- SEED DEMO — METIER TRANSITAIRE (freight forwarding)
-- Compte de test : created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
-- Marche Maroc / Afrique de l'Ouest, engins de chantier & mine, MAD
-- Idempotent : DELETE des lignes de cet uid puis re-INSERT.
-- A coller tel quel dans Supabase SQL Editor.
-- Colonne RLS : created_by (auth.uid() = created_by)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. NETTOYAGE (idempotence) — supprime les lignes de demo de cet uid
-- ---------------------------------------------------------------------
DELETE FROM customs_declarations    WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM freight_containers      WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM freight_monthly_volumes WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM freight_documents       WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';

-- ---------------------------------------------------------------------
-- 1. DECLARATIONS DOUANIERES (customs_declarations)
--    status IN ('En préparation','Soumise','En contrôle douanier','Liquidée','Bloquée','Annulée')
--    clearance_type IN ('Import','Export','Transit')
--    ALERTE : 1 ligne 'Bloquee' + 1 ligne 'En controle douanier' echeance imminente
-- ---------------------------------------------------------------------
INSERT INTO customs_declarations
  (reference, status, clearance_type, customs_office, client_name, cargo_summary, declared_value_mad, submitted_at, expected_clearance_date, notes, created_by)
VALUES
  ('DAM-2026-0311', 'En contrôle douanier', 'Import', 'Port Casablanca (Scan)', 'Ciments du Maroc SA',
   '40'' HC — pièces détachées concasseur Metso', 2450000, NOW() - INTERVAL '3 days', CURRENT_DATE + 2,
   'Attente rapport scanner — dossier prioritaire', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DAM-2026-0308', 'Soumise', 'Import', 'Tanger Med', 'Atlas Mining Equipment SARL',
   '2×40'' — 1 excavatrice chenilles CAT 336 démontée', 4100000, NOW() - INTERVAL '1 day', CURRENT_DATE + 5,
   NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DEX-2026-0079', 'En préparation', 'Export', 'Agadir', 'OCP Shipping',
   'Big bags phosphate — lot export Dakar (12 conteneurs)', 890000, NULL, CURRENT_DATE + 10,
   'Facture proforma à finaliser', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DAM-2026-0295', 'Bloquée', 'Import', 'Port Casablanca', 'BTP Horizon Afrique',
   'Bulldozer Komatsu D65 démonté — pièce manquante dossier', 6200000, NOW() - INTERVAL '12 days', CURRENT_DATE - 1,
   'Certificat origine L388 manquant — relance client en cours', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DTR-2026-0033', 'Soumise', 'Transit', 'Tanger Med', 'Sahel Logistics (Mali)',
   'Transit vers Bamako — chargeuse sur pneus Volvo L120', 3300000, NOW() - INTERVAL '2 days', CURRENT_DATE + 8,
   'Escorte douanière frontière — Bamako via Nouakchott', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DAM-2026-0270', 'Liquidée', 'Import', 'Tanger Med', 'Safi Energy',
   'Pièces de turbine + groupe électrogène 500 kVA', 1800000, NOW() - INTERVAL '25 days', CURRENT_DATE - INTERVAL '12 days',
   'Dédouanée — BAE délivré', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DAM-2025-0990', 'Liquidée', 'Import', 'Port Casablanca', 'Cimenterie de l''Oriental',
   'Convoyeur à bande + moteurs — projet carrière Oujda', 2650000, NOW() - INTERVAL '65 days', CURRENT_DATE - INTERVAL '50 days',
   'Archivée', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('DEX-2026-0051', 'Annulée', 'Export', 'Agadir', 'Agri Sud Trading',
   'Groupe de pompage — commande client annulée', 420000, NOW() - INTERVAL '18 days', NULL,
   'Annulation client — remboursement acompte', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- ---------------------------------------------------------------------
-- 2. CONTENEURS (freight_containers) — suivi + GPS
--    status IN ('En mer','Transbordement','À quai','Douane','Livré','Retard')
--    ALERTE : 1 ligne 'Retard' (ETA depassee)
--    Coordonnees approx. ports Maroc / large maritime.
-- ---------------------------------------------------------------------
INSERT INTO freight_containers
  (container_number, status, lat, lng, vessel_name, voyage_ref, last_port, next_port, eta, notes, created_by)
VALUES
  ('MSKU 9123456', 'À quai', 33.608000, -7.479000, 'MSC LENI', 'VY-MA426', 'Tanger Med', 'Casablanca',
   NOW() + INTERVAL '18 hours', 'Déchargement prévu ce soir', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('TEMU 7788123', 'En mer', 35.200000, -8.100000, 'CMA CGM TAGE', 'AE-CAS-09', 'Algésiras', 'Casablanca',
   NOW() + INTERVAL '2 days', NULL, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('OOLU 4455661', 'Douane', 33.605000, -7.515000, 'OOCL ROTTERDAM', 'RT-CAS-14', 'Anvers', 'Casablanca',
   NOW() + INTERVAL '6 hours', 'Sélectionné circuit rouge — visite physique', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('MRKU 3390027', 'Transbordement', 35.890000, -5.500000, 'MAERSK CANTON', 'TM-TR-77', 'Valence', 'Tanger Med',
   NOW() + INTERVAL '1 day', 'Transbordement hub Tanger Med', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('HLCU 6612340', 'En mer', 20.900000, -17.050000, 'HANSA AFRICA', 'WA-DKR-21', 'Casablanca', 'Dakar',
   NOW() + INTERVAL '4 days', 'Cabotage Afrique de l''Ouest — engins TP', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('FCIU 2211009', 'Retard', 30.400000, -9.600000, 'IBN BATOUTA', 'MO-LIV-05', 'Mohammedia', 'Livraison client',
   NOW() - INTERVAL '1 day', 'Retard déchargement — créneau réaffrété', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('CAIU 8801235', 'Livré', 33.700000, -7.380000, 'MSC RANIA', 'VY-MA401', 'Casablanca', 'Berrechid (dépôt)',
   NOW() - INTERVAL '5 days', 'Livré chantier client — vide restitué', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- ---------------------------------------------------------------------
-- 3. VOLUMES MENSUELS I/E (freight_monthly_volumes) — graphiques evolution
--    direction IN ('Import','Export')
--    UNIQUE (created_by, period_month, direction) — 1 seule ligne par (mois,sens)
--    6 derniers mois, Import + Export -> 12 lignes. Tendance croissante.
-- ---------------------------------------------------------------------
INSERT INTO freight_monthly_volumes (period_month, direction, teu_count, value_mad, created_by)
VALUES
  -- Mois courant
  ((date_trunc('month', CURRENT_DATE))::date,                              'Import', 59.5, 16800000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  ((date_trunc('month', CURRENT_DATE))::date,                              'Export', 39.0, 11000000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- M-1
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,         'Import', 56.0, 15600000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,         'Export', 36.8, 10200000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- M-2
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date,        'Import', 52.5, 14900000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date,        'Export', 34.6,  9700000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- M-3
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '3 months')::date,        'Import', 49.0, 14100000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '3 months')::date,        'Export', 32.4,  9100000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- M-4
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '4 months')::date,        'Import', 45.5, 13300000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '4 months')::date,        'Export', 30.2,  8900000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- M-5
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')::date,        'Import', 42.0, 12000000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  ((date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')::date,        'Export', 28.0,  8500000, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- ---------------------------------------------------------------------
-- 4. DOCUMENTS FRET (freight_documents)
--    doc_type IN ('Connaissement','Facture','Liste colisage','Certificat origine','Autre')
--    status   IN ('Brouillon','En attente','Validé','Rejeté','Expiré')
--    priority IN ('Normal','Urgent')
--    ALERTE : 1 doc 'Urgent' echeance demain, 1 doc 'Rejeté' echeance depassee, 1 doc 'Expiré'
-- ---------------------------------------------------------------------
INSERT INTO freight_documents
  (title, doc_type, status, priority, due_date, linked_container_number, linked_declaration_ref, notes, created_by)
VALUES
  ('B/L — MSKU 9123456', 'Connaissement', 'En attente', 'Urgent', CURRENT_DATE + 1,
   'MSKU 9123456', 'DAM-2026-0311', 'Original attendu — transitaire Rotterdam', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('Facture commerciale DEX-2026-0079', 'Facture', 'Brouillon', 'Normal', CURRENT_DATE + 7,
   NULL, 'DEX-2026-0079', 'A finaliser avant soumission douane', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('Certificat origine phosphate OCP', 'Certificat origine', 'Validé', 'Normal', CURRENT_DATE + 14,
   NULL, 'DEX-2026-0079', 'Visé Chambre de commerce Agadir', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('Liste de colisage LCL Tanger', 'Liste colisage', 'Rejeté', 'Urgent', CURRENT_DATE - 2,
   'TEMU 7788123', 'DAM-2026-0308', 'Incohérence poids brut — à renvoyer', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('Certificat origine L388 — BTP Horizon', 'Certificat origine', 'En attente', 'Urgent', CURRENT_DATE,
   NULL, 'DAM-2026-0295', 'Bloque le dédouanement du bulldozer', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('B/L — HLCU 6612340 (Dakar)', 'Connaissement', 'Validé', 'Normal', CURRENT_DATE + 4,
   'HLCU 6612340', 'DTR-2026-0033', 'Export cabotage Dakar', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('Assurance transport 2025 — police cadre', 'Autre', 'Expiré', 'Normal', CURRENT_DATE - 20,
   NULL, NULL, 'Police échue — renouvellement à faire', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

  ('Facture commerciale DAM-2026-0270', 'Facture', 'Validé', 'Normal', CURRENT_DATE - 10,
   'CAIU 8801235', 'DAM-2026-0270', 'Réglée — dossier clôturé', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- =====================================================================
-- FIN SEED TRANSITAIRE
-- Verification rapide :
--   SELECT status, count(*) FROM customs_declarations WHERE created_by='a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY status;
--   SELECT status, count(*) FROM freight_containers   WHERE created_by='a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY status;
--   SELECT direction, count(*) FROM freight_monthly_volumes WHERE created_by='a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY direction;
--   SELECT status, count(*) FROM freight_documents   WHERE created_by='a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY status;
-- =====================================================================


-- ################## METIER: logisticien / supply chain (tables: logistics_warehouses, logistics_route_tracking, logistics_scm_kpis_monthly, logistics_stock_alerts) ##################
-- =====================================================================
-- SEED DEMO — MÉTIER LOGISTICIEN / SUPPLY CHAIN (MineGrid Equipement)
-- Marché : Maroc / Afrique de l'Ouest — engins de chantier & mine
-- Compte de test (created_by / RLS) : a7583ae2-53a3-4668-a4e0-0b12f9eca2f1
-- À coller tel quel dans Supabase SQL Editor. Relançable (idempotent).
-- =====================================================================

-- ---- Nettoyage des lignes de démo de cet uid (ordre libre, pas de FK) ----
DELETE FROM logistics_stock_alerts      WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM logistics_route_tracking    WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM logistics_scm_kpis_monthly  WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM logistics_warehouses        WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';

-- =====================================================================
-- 1) ENTREPÔTS  (logistics_warehouses)
--    status ∈ ('Opérationnel','Surchargé','Maintenance','Fermé')
--    Alerte "surcharge" : DCE Tanger Med -> used quasi = capacity (Surchargé)
-- =====================================================================
INSERT INTO logistics_warehouses
  (name, city, zone, capacity_pallets, used_pallets, status, notes, created_by, created_at, updated_at)
VALUES
  ('Hub Aïn Sebaâ',            'Casablanca', 'Casa métropole',      4200, 3780, 'Opérationnel', 'Pic saisonnier BTP — pièces engins', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '210 days', now() - interval '3 days'),
  ('DCE Tanger Med Logistics', 'Tanger',     'Nord',                5100, 5020, 'Surchargé',    'Congestion import — débord vers Fès requis', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '180 days', now() - interval '1 day'),
  ('Plateforme Fès',           'Fès',        'Oriental',            2100, 1320, 'Opérationnel', 'Capacité tampon disponible', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '150 days', now() - interval '5 days'),
  ('Magasin Marrakech Sud',    'Marrakech',  'Sud',                 1600,  940, 'Opérationnel', 'Dessert chantiers Ouarzazate/Agadir', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '120 days', now() - interval '9 days'),
  ('Dépôt Nouakchott',         'Nouakchott', 'Mauritanie',           900,  610, 'Opérationnel', 'Relais mines SNIM / fer', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '95 days', now() - interval '12 days'),
  ('Entrepôt Abidjan Port',    'Abidjan',    'Côte d''Ivoire',      1400,  880, 'Maintenance',  'Réaménagement racks — capacité réduite', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '80 days', now() - interval '2 days'),
  ('Hub Dakar Diamniadio',     'Dakar',      'Sénégal',             1750, 1180, 'Opérationnel', 'Distribution Afrique de l''Ouest', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '60 days', now() - interval '4 days');

-- =====================================================================
-- 2) SUIVI ROUTES  (logistics_route_tracking)
--    status ∈ ('Planifié','En route','Livré','Retard','Annulé')
--    Alerte "retard / ETA dépassée" : RT-CAS-0291 (Retard, eta passée)
-- =====================================================================
INSERT INTO logistics_route_tracking
  (route_ref, vehicle_label, status,
   origin_lat, origin_lng, dest_lat, dest_lng, current_lat, current_lng,
   origin_label, dest_label, cargo_summary, eta, notes, created_by, created_at, updated_at)
VALUES
  ('RT-CAS-0288', 'Mercedes Actros 1845', 'En route',
     35.8837, -5.5000, 34.0331, -5.0003, 34.9200, -5.2500,
     'Tanger Med', 'Fès', 'Filtres hydrauliques + flexibles (valeur 480 000 MAD)', now() + interval '6 hours', 'Chargement pièces Komatsu/Caterpillar', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '8 hours', now() - interval '30 minutes'),
  ('RT-CAS-0291', 'Renault T High 480', 'Retard',
     31.6295, -7.9811, 33.5731, -7.5898, 32.3000, -7.7500,
     'Marrakech', 'Casablanca Hub', 'Lot palettes CP + godets (valeur 620 000 MAD)', now() - interval '90 minutes', 'ETA dépassée — barrage pluie Oued sur N9', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '14 hours', now() - interval '20 minutes'),
  ('RT-CAS-0295', 'Volvo FH16 750', 'Planifié',
     33.5731, -7.5898, 35.1681, -2.9287, NULL, NULL,
     'Casablanca', 'Nador', 'Châssis + train de chaînes projet minier (valeur 1 250 000 MAD)', now() + interval '26 hours', 'Départ prévu demain 05h00', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '2 days', now() - interval '2 days'),
  ('RT-WAF-0312', 'Scania R500', 'En route',
     14.7167, -17.4677, 18.0858, -15.9785, 16.5000, -16.7000,
     'Dakar', 'Nouakchott', 'Pièces moteur foreuses (valeur 340 000 MAD)', now() + interval '11 hours', 'Corridor Dakar–Nouakchott', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '20 hours', now() - interval '1 hour'),
  ('RT-CAS-0279', 'Mercedes Actros 2545', 'Livré',
     33.5731, -7.5898, 31.6295, -7.9811, 31.6295, -7.9811,
     'Casablanca Hub', 'Marrakech Sud', 'Lubrifiants + filtres à air (valeur 210 000 MAD)', now() - interval '3 days', 'Livraison conforme, POD signé', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '5 days', now() - interval '3 days'),
  ('RT-CAS-0270', 'Iveco S-Way', 'Livré',
     35.8837, -5.5000, 33.5731, -7.5898, 33.5731, -7.5898,
     'Tanger Med', 'Hub Aïn Sebaâ', 'Pneus génie civil 29.5R25 (valeur 890 000 MAD)', now() - interval '9 days', 'Livraison J-9', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '11 days', now() - interval '9 days'),
  ('RT-WAF-0305', 'MAN TGX', 'Annulé',
     5.3599, -4.0083, 12.6392, -8.0029, NULL, NULL,
     'Abidjan Port', 'Bamako', 'Godets + dents projet BTP (valeur 400 000 MAD)', now() - interval '2 days', 'Annulé — client a repoussé le chantier', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '6 days', now() - interval '2 days');

-- =====================================================================
-- 3) KPIs MENSUELS  (logistics_scm_kpis_monthly)
--    UNIQUE (created_by, period_month) — 1 ligne / mois, 6 derniers mois
--    Tendance parlante : ponctualité en hausse, incidents en baisse
-- =====================================================================
INSERT INTO logistics_scm_kpis_monthly
  (period_month, on_time_pct, fill_rate_pct, avg_lead_time_days, incidents, created_by, created_at)
VALUES
  (date_trunc('month', now())::date,                          94.20, 91.50, 3.10, 1, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now()),
  ((date_trunc('month', now()) - interval '1 month')::date,   92.80, 90.20, 3.30, 2, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '30 days'),
  ((date_trunc('month', now()) - interval '2 months')::date,  90.50, 88.70, 3.60, 3, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '60 days'),
  ((date_trunc('month', now()) - interval '3 months')::date,  89.10, 87.40, 3.90, 4, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '90 days'),
  ((date_trunc('month', now()) - interval '4 months')::date,  87.60, 86.10, 4.20, 5, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '120 days'),
  ((date_trunc('month', now()) - interval '5 months')::date,  85.30, 84.50, 4.60, 6, 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '150 days');

-- =====================================================================
-- 4) ALERTES STOCK  (logistics_stock_alerts)
--    alert_type ∈ ('Rupture','Excédent','Seuil bas')
--    priority ∈ ('Normal','Urgent') ; status ∈ ('Ouvert','En traitement','Clôturé')
--    Alerte critique garantie : FIL-HYD-2040-B => Rupture / Urgent / current_qty=0
-- =====================================================================
INSERT INTO logistics_stock_alerts
  (sku_label, warehouse_name, alert_type, current_qty, target_qty, priority, status, notes, created_by, created_at, updated_at)
VALUES
  ('FIL-HYD-2040-B',  'Hub Aïn Sebaâ',            'Rupture',   0.00,   120.00, 'Urgent', 'Ouvert',        'Filtre hydraulique — commande fournisseur J+3', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '1 day',  now() - interval '2 hours'),
  ('CHN-KOM-PC350',   'DCE Tanger Med Logistics', 'Seuil bas', 8.00,    25.00, 'Urgent', 'En traitement', 'Train de chaînes Komatsu PC350 — sous seuil', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '3 days', now() - interval '6 hours'),
  ('GOD-CAT-320-STD', 'Plateforme Fès',           'Seuil bas', 4.00,    15.00, 'Normal', 'Ouvert',        'Godet standard CAT 320 — réappro à lancer', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '2 days', now() - interval '2 days'),
  ('PNEU-2950R25',    'Hub Aïn Sebaâ',            'Rupture',   0.00,    16.00, 'Urgent', 'Ouvert',        'Pneu génie civil 29.5R25 — délai import 4 sem.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '5 hours', now() - interval '5 hours'),
  ('PAL-EUR-1200',    'Plateforme Fès',           'Excédent',  1850.00, 900.00, 'Normal', 'Ouvert',        'Palettes EUR — surstock, redéployer vers Tanger', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '7 days', now() - interval '7 days'),
  ('LUB-15W40-208L',  'Magasin Marrakech Sud',    'Seuil bas', 12.00,   40.00, 'Normal', 'En traitement', 'Fût lubrifiant 15W40 208L — commande en cours', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '4 days', now() - interval '1 day'),
  ('FIL-AIR-DONALDSON','Hub Dakar Diamniadio',    'Seuil bas', 18.00,   30.00, 'Normal', 'Clôturé',       'Filtre à air Donaldson — réappro reçue, alerte close', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '10 days', now() - interval '2 days');

-- =====================================================================
-- FIN DU SEED — 7 entrepôts, 7 routes, 6 mois de KPIs, 7 alertes stock
-- =====================================================================


-- ################## METIER: investisseur (tables: investments, investment_opportunities) ##################
-- =====================================================================
-- SEED DE DÉMONSTRATION — MÉTIER INVESTISSEUR (MineGrid Equipement)
-- Compte de test : created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
-- Marché : Maroc / Afrique de l'Ouest — engins de chantier & mine — MAD
-- Idempotent : relançable (DELETE des lignes de démo de cet uid en tête)
-- NB : sur investment_opportunities, expected_roi_percent, payback_months
--      et reference (si vide) sont AUTO-CALCULÉS par le trigger
--      trg_opportunities_compute -> ne PAS les fournir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. NETTOYAGE IDEMPOTENT (ordre : opportunities d'abord car FK possible)
-- ---------------------------------------------------------------------
DELETE FROM investment_opportunities WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM investments             WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';

-- =====================================================================
-- 1. INVESTMENTS — Portefeuille actuel (7 lignes)
--    Statuts variés + dates d'acquisition étalées + cession récente
-- =====================================================================
INSERT INTO investments (
  reference, equipment_label, category, brand, model, year, serial_number,
  acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
  current_market_value, expected_lifespan_years, residual_value,
  current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date, location_count,
  status, exit_strategy, target_exit_date, target_exit_price, notes, created_by
) VALUES
-- Pelle en location, financée crédit-bail, forte rentabilité
('INV-2023-001', 'Pelle hydraulique Caterpillar 320D', 'Pelle hydraulique', 'Caterpillar', '320D', 2018, 'CAT320D-A0451',
 now() - interval '26 months', 1100000, 'Crédit-bail', 18500,
 850000, 10, 250000,
 46000, 1010000, 92000, 13,
 'En location', 'Conserver', NULL, NULL, 'Chantier route Marrakech-Ouarzazate. Loueur : BTP Atlas.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Bulldozer récent, détenu, crédit bancaire
('INV-2023-002', 'Bulldozer Komatsu D65PX-18', 'Bulldozer', 'Komatsu', 'D65PX-18', 2020, 'KOMD65-2020-118',
 now() - interval '15 months', 1450000, 'Crédit', 23410,
 1280000, 12, 350000,
 62000, 760000, 45000, 8,
 'Détenu', 'Conserver', NULL, NULL, 'Terrassement plateforme industrielle Kénitra.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Camion-benne ancien en cession programmée (alerte : sortie proche)
('INV-2022-003', 'Camion-benne Mercedes-Benz Arocs 4148', 'Camion-benne', 'Mercedes-Benz', 'Arocs 4148', 2017, 'MBARC-4148-771',
 now() - interval '37 months', 980000, 'Cash', 0,
 610000, 10, 180000,
 32000, 1210000, 148000, 19,
 'En cession', 'Revendre moyen terme', now() + interval '25 days', 580000,
 'Cession en cours — acquéreur pressenti à Dakar. Sortie < 1 mois.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Chargeuse déjà CÉDÉE (le mois dernier) — alimente KPI "cessions récentes"
('INV-2022-004', 'Chargeuse Volvo L120H', 'Chargeuse', 'Volvo', 'L120H', 2016, 'VOLL120H-5502',
 now() - interval '39 months', 850000, 'Cash', 0,
 450000, 10, 150000,
 0, 920000, 98000, 22,
 'Cédé', 'Revendre court terme', now() - interval '20 days', 510000,
 'Cédée à BTP Atlas SARL pour 510 000 MAD (plus-value nette réalisée).', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Concasseur récent, gros ticket, en location — acquisition CE TRIMESTRE
('INV-2025-005', 'Concasseur mobile Sandvik QJ241', 'Concasseur', 'Sandvik', 'QJ241', 2022, 'SANQJ241-0093',
 now() - interval '5 months', 2350000, 'Crédit-bail', 38200,
 2180000, 12, 600000,
 120000, 620000, 24000, 3,
 'En location', 'Conserver', NULL, NULL, 'Carrière granulats région Béni Mellal. Demande OCP en hausse.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Engin EN MAINTENANCE (alerte : revenu à 0, coûts qui montent)
('INV-2023-006', 'Tombereau articulé Bell B30E', 'Tombereau', 'Bell', 'B30E', 2019, 'BELLB30E-6841',
 now() - interval '20 months', 1780000, 'Mixte', 21000,
 1350000, 10, 400000,
 0, 690000, 165000, 9,
 'En maintenance', 'Conserver', NULL, NULL,
 'Immobilisé — révision transmission. Retour prévu sous 3 semaines.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Foreuse haut de gamme, acquisition TRÈS récente (ce mois-ci)
('INV-2025-007', 'Foreuse Epiroc SmartROC D65', 'Foreuse', 'Epiroc', 'SmartROC D65', 2023, 'EPISRD65-0207',
 now() - interval '18 days', 4200000, 'Crédit-bail', 61500,
 4150000, 8, 2000000,
 180000, 95000, 6000, 1,
 'En location', 'Conserver', NULL, NULL,
 'Mine Managem — contrat 24 mois. Garantie constructeur 2 ans.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- =====================================================================
-- 2. INVESTMENT_OPPORTUNITIES — Pipeline d'achat (6 lignes)
--    reference / expected_roi_percent / payback_months = AUTO (trigger)
--    Recommandations & statuts variés + 1 opportunité qui EXPIRE bientôt
-- =====================================================================
INSERT INTO investment_opportunities (
  equipment_label, category, brand, model, year, source, source_url,
  asking_price, estimated_market_value, estimated_acquisition_costs,
  expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
  expected_resale_value, risk_score, risk_factors, recommendation, status,
  contact_name, contact_phone, expiry_date, notes, created_by
) VALUES
-- Bonne affaire, à acheter, en négociation, expire dans 12j
('Pelle Komatsu PC290LC-11', 'Pelle hydraulique', 'Komatsu', 'PC290LC-11', 2021, 'Marché secondaire', NULL,
 980000, 1050000, 35000,
 48000, 12000, 6,
 520000, 4, 'État correct, 4500h. Forte demande locative. Prévoir révision moteur < 6 mois.',
 'Acheter', 'En négociation',
 'Ahmed Berrada', '+212 6 12 33 44 55', now()::date + interval '12 days',
 'Inspection technique OK. Vendeur ouvert à -5%.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Lot enchères, risque élevé, ALERTE : expire dans 3 jours
('Lot 2 Camions-bennes Renault Kerax 380', 'Camion-benne', 'Renault', 'Kerax 380', 2015, 'Encan / Enchères', NULL,
 640000, 720000, 25000,
 55000, 18000, 4,
 280000, 7, 'Modèle âgé, électronique vieillissante. Pneus à changer. Risque pénurie pièces.',
 'Étudier', 'Active',
 'BCM Auctions', '+212 522 99 00 11', now()::date + interval '3 days',
 'Enchère en ligne — clôture imminente. Décision à prendre vite.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Gros ticket premium, à acheter, concessionnaire
('Foreuse Epiroc SmartROC D65 (neuve)', 'Foreuse', 'Epiroc', 'SmartROC D65', 2024, 'Concessionnaire', NULL,
 4200000, 4400000, 80000,
 180000, 35000, 8,
 2100000, 3, 'Engin neuf, techno de pointe. Marges élevées. Demande minière OCP/Managem en hausse.',
 'Acheter', 'Active',
 'Atlas Copco Maroc', '+212 522 67 80 90', now()::date + interval '20 days',
 'Garantie constructeur 2 ans. Formation incluse.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Sur-évaluée, à passer, DÉJÀ REFUSÉE
('Niveleuse Caterpillar 140K', 'Niveleuse', 'Caterpillar', '140K', 2014, 'Vente directe', NULL,
 720000, 680000, 15000,
 28000, 8000, 5,
 280000, 8, 'Sur-évaluée (+10% marché). 12000h. Maintenance lourde imminente.',
 'Passer', 'Refusée',
 'Particulier - Khaled', '+212 6 61 00 22 33', now()::date - interval '2 days',
 'Écartée : prix non négociable et heures trop élevées.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Opportunité récente à étudier, annonce Minegrid
('Chargeuse Doosan DL420-5', 'Chargeuse', 'Doosan', 'DL420-5', 2019, 'Annonce Minegrid', NULL,
 890000, 940000, 20000,
 42000, 11000, 6,
 380000, 5, 'Bon état, 5200h. Marque moins courante au Maroc → vérifier réseau pièces.',
 'À étudier', 'Active',
 'Mining Solutions Maroc', '+212 5 39 12 34 56', now()::date + interval '28 days',
 'Reçue cette semaine. À inspecter sur site à Tanger.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),

-- Opportunité CONVERTIE (achetée) — alimente KPI conversion pipeline
('Bulldozer Komatsu D85EX-15', 'Bulldozer', 'Komatsu', 'D85EX-15', 2018, 'Reprise client', NULL,
 1250000, 1320000, 30000,
 68000, 16000, 7,
 480000, 5, 'Reprise dans le cadre d''un renouvellement de flotte. Historique entretien complet.',
 'Acheter', 'Convertie',
 'Sté Sahara Travaux', '+212 6 70 88 99 00', now()::date - interval '10 days',
 'Achat finalisé — engin intégré au portefeuille.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- =====================================================================
-- VÉRIFICATION RAPIDE (optionnel)
-- =====================================================================
-- SELECT status, count(*) FROM investments             WHERE created_by='a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY status;
-- SELECT recommendation, status, expected_roi_percent, payback_months, reference
--   FROM investment_opportunities WHERE created_by='a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' ORDER BY expected_roi_percent DESC;



-- ################## METIER: courtier (Crédit + Assurance) — MineGrid Équipement (tables: broker_clients, credit_applications, insurance_policies) ##################
-- =====================================================================
-- SEED DE DEMONSTRATION — METIER COURTIER (Credit + Assurance)
-- Compte de test : created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
-- Marche Maroc / Afrique de l'Ouest, engins de chantier/mine, montants MAD
-- Idempotent : les DELETE en tete permettent de relancer le script.
-- IMPORTANT : les credit_applications et insurance_policies referencent
--   broker_clients.client_id -> on supprime dans le bon ordre (enfants d'abord)
--   puis on reinsere les clients AVANT credits/polices (via CTE).
-- Rappel triggers auto : commission_amount, end_date et policy_number sont
--   recalcules si NULL/vide -> on fournit des valeurs explicites malgre tout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. NETTOYAGE (enfants d'abord a cause des FK)
-- ---------------------------------------------------------------------
DELETE FROM insurance_policies  WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM credit_applications WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM broker_clients      WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';

-- ---------------------------------------------------------------------
-- 1. BROKER_CLIENTS (portefeuille clients courtier) — 6 lignes
--    type IN ('Particulier','Entreprise','TPE','PME','Grand Compte')
--    status IN ('Prospect','Actif','Inactif','Bloqué')
-- ---------------------------------------------------------------------
-- On genere des UUID fixes pour pouvoir les reutiliser dans les tables filles.
INSERT INTO broker_clients
  (id, name, company_name, type, email, phone, address, city, country, sector, rc_number, ice_number, status, notes, created_by, created_at, updated_at)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'BTP Atlas SARL', 'BTP Atlas SARL', 'PME',
   'contact@btpatlas.ma', '+212 524 33 22 11', 'Zone Industrielle Sidi Ghanem, Lot 42', 'Marrakech', 'Maroc',
   'BTP / Construction', 'RC 45231', '001234567000089', 'Actif',
   'Client fidele depuis 2022. Flotte de 6 engins.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '400 days', now() - interval '5 days'),

  ('c2222222-2222-2222-2222-222222222222', 'OCP Bouskoura', 'OCP Group', 'Grand Compte',
   'achat-engins@ocpgroup.ma', '+212 522 67 89 00', 'Site minier de Bouskoura', 'Casablanca', 'Maroc',
   'Mines / Phosphates', 'RC 112009', '000456789000045', 'Actif',
   'Grand compte strategique. Marches recurrents.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '300 days', now() - interval '12 days'),

  ('c3333333-3333-3333-3333-333333333333', 'Carrieres du Doukkala', 'Carrieres du Doukkala SA', 'PME',
   'direction@carrieres-doukkala.ma', '+212 523 34 56 78', 'Route de Safi KM8', 'El Jadida', 'Maroc',
   'Carrieres / Granulats', 'RC 8842', '002233445000067', 'Prospect',
   'En cours de qualification. Interesse par credit-bail.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '20 days', now() - interval '3 days'),

  ('c4444444-4444-4444-4444-444444444444', 'Ahmed Zerouali', NULL, 'Particulier',
   'a.zerouali@gmail.com', '+212 6 78 12 34 56', 'Avenue Mohammed V, Res. Al Baraka', 'Tanger', 'Maroc',
   'Travaux agricoles', NULL, NULL, 'Actif',
   'Achat mini-pelle a titre personnel.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '90 days', now() - interval '8 days'),

  ('c5555555-5555-5555-5555-555555555555', 'Sahel Mining Cote d''Ivoire', 'Sahel Mining SA', 'Grand Compte',
   'procurement@sahelmining.ci', '+225 27 20 30 40 50', 'Zone Industrielle Yopougon', 'Abidjan', 'Cote d''Ivoire',
   'Mines / Or', 'RCCM CI-ABJ-2019-B-12345', NULL, 'Actif',
   'Export engins vers l''Afrique de l''Ouest. Paiement en devises.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '150 days', now() - interval '2 days'),

  ('c6666666-6666-6666-6666-666666666666', 'Gravaux Souss TPE', 'Gravaux Souss', 'TPE',
   'gravaux.souss@menara.ma', '+212 528 84 11 22', 'Route d''Agadir, Ait Melloul', 'Agadir', 'Maroc',
   'Terrassement', 'RC 3320', '003344556000012', 'Inactif',
   'A relancer : pas de dossier actif depuis 8 mois.', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '260 days', now() - interval '240 days');

-- ---------------------------------------------------------------------
-- 2. CREDIT_APPLICATIONS (demandes de credit acquisition d'engins) — 7 lignes
--    status IN ('Brouillon','En cours','Approuvé','Refusé','Décaissé','Annulé')
--    commission_amount laisse NULL -> recalcule par trigger
--    (requested_amount * commission_rate / 100)
--    Montants en MAD. Dates variees dont ce mois-ci pour KPI parlants.
-- ---------------------------------------------------------------------
INSERT INTO credit_applications
  (reference, client_id, client_name_snapshot, equipment_label, equipment_value, requested_amount,
   down_payment, duration_months, interest_rate, monthly_payment, bank_name,
   application_date, expected_decision_date, decision_date, disbursement_date,
   status, commission_rate, commission_amount, notes, created_by, created_at, updated_at)
VALUES
  -- En cours, decision attendue bientot (dossier du mois)
  ('CR-2026-001', 'c1111111-1111-1111-1111-111111111111', 'BTP Atlas SARL',
   'Pelle hydraulique Caterpillar 320D', 950000, 750000,
   200000, 60, 6.50, 14680, 'Banque Populaire',
   (now() - interval '5 days')::date, (now() + interval '10 days')::date, NULL, NULL,
   'En cours', 1.50, NULL,
   'Dossier complet. Garantie : nantissement engin + caution dirigeant.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '5 days', now() - interval '5 days'),

  -- Decaisse (revenu confirme, gros ticket)
  ('CR-2026-002', 'c2222222-2222-2222-2222-222222222222', 'OCP Bouskoura',
   'Lot 3 camions-bennes Mercedes Arocs 3345', 4200000, 3500000,
   700000, 84, 5.80, 50820, 'Attijariwafa Bank',
   (now() - interval '30 days')::date, (now() - interval '15 days')::date, (now() - interval '12 days')::date, (now() - interval '8 days')::date,
   'Décaissé', 1.20, NULL, NULL,
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '30 days', now() - interval '8 days'),

  -- En cours (prospect en conversion, ce mois-ci)
  ('CR-2026-003', 'c3333333-3333-3333-3333-333333333333', 'Carrieres du Doukkala',
   'Concasseur mobile Sandvik QJ241', 2100000, 1800000,
   300000, 72, 6.95, 30200, 'Bank Of Africa',
   (now() - interval '15 days')::date, (now() + interval '5 days')::date, NULL, NULL,
   'En cours', 1.75, NULL,
   'Etude impact environnemental requise par la banque.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '15 days', now() - interval '4 days'),

  -- Approuve (en attente decaissement)
  ('CR-2026-004', 'c1111111-1111-1111-1111-111111111111', 'BTP Atlas SARL',
   'Bulldozer Komatsu D65EX-18', 1450000, 1200000,
   250000, 60, 6.20, 23410, 'CIH Bank',
   (now() - interval '45 days')::date, (now() - interval '25 days')::date, (now() - interval '20 days')::date, NULL,
   'Approuvé', 1.50, NULL, 'Signature contrat prevue cette semaine.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '45 days', now() - interval '20 days'),

  -- Refuse (pour taux de conversion realiste)
  ('CR-2026-005', 'c6666666-6666-6666-6666-666666666666', 'Gravaux Souss',
   'Chargeuse sur pneus JCB 457', 1150000, 980000,
   150000, 60, 7.20, 19540, 'Credit du Maroc',
   (now() - interval '60 days')::date, (now() - interval '40 days')::date, (now() - interval '38 days')::date, NULL,
   'Refusé', 1.50, NULL, 'Refus banque : ratio d''endettement trop eleve.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '60 days', now() - interval '38 days'),

  -- Brouillon (particulier, petit ticket, ce mois-ci)
  ('CR-2026-006', 'c4444444-4444-4444-4444-444444444444', 'Ahmed Zerouali',
   'Mini-pelle Kubota U27-4', 320000, 260000,
   60000, 48, 6.90, 6180, 'Banque Populaire',
   (now() - interval '2 days')::date, (now() + interval '18 days')::date, NULL, NULL,
   'Brouillon', 2.00, NULL, 'En attente justificatifs de revenus.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '2 days', now() - interval '2 days'),

  -- Decaisse export Afrique de l'Ouest (gros ticket, mois precedent)
  ('CR-2026-007', 'c5555555-5555-5555-5555-555555555555', 'Sahel Mining Cote d''Ivoire',
   'Foreuse de mine Sandvik DD422i', 6800000, 5500000,
   1300000, 84, 6.10, 81300, 'BMCE Bank Of Africa',
   (now() - interval '75 days')::date, (now() - interval '55 days')::date, (now() - interval '50 days')::date, (now() - interval '42 days')::date,
   'Décaissé', 1.10, NULL, 'Financement export. Garantie SMAEX.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '75 days', now() - interval '42 days');

-- ---------------------------------------------------------------------
-- 3. INSURANCE_POLICIES (polices d'assurance) — 7 lignes
--    policy_type IN ('Responsabilité Civile','Tous risques','Bris de machine',
--      'Multirisques chantier','Transport marchandises','Flotte automobile',
--      'Multirisques professionnelle')
--    payment_frequency IN ('Mensuel','Trimestriel','Semestriel','Annuel')
--    status IN ('Devis','En cours','Active','Expirée','Résiliée','Suspendue')
--    commission_amount laisse NULL -> recalcule par trigger
--    (annual_premium * commission_rate / 100)
--    ALERTE : POL-EXPIRE-SOON expire dans 15 jours (renouvellement proche).
-- ---------------------------------------------------------------------
INSERT INTO insurance_policies
  (policy_number, client_id, client_name_snapshot, equipment_label, insurer_name, policy_type,
   insured_value, annual_premium, payment_frequency, start_date, end_date, status, commission_rate,
   commission_amount, deductible, claim_count, auto_renewal, notes, created_by, created_at, updated_at)
VALUES
  -- Active, tous risques
  ('POL-2025-A0451', 'c1111111-1111-1111-1111-111111111111', 'BTP Atlas SARL',
   'Pelle hydraulique Caterpillar 320D', 'AXA Assurance Maroc', 'Tous risques',
   950000, 38500, 'Annuel', (now() - interval '60 days')::date, (now() + interval '305 days')::date, 'Active', 12.00,
   NULL, 15000, 0, TRUE, NULL,
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '60 days', now() - interval '60 days'),

  -- Active, multirisques chantier, 1 sinistre
  ('POL-2025-MRC-2189', 'c2222222-2222-2222-2222-222222222222', 'OCP Bouskoura',
   'Flotte 3 camions Mercedes Arocs 3345', 'Wafa Assurance', 'Multirisques chantier',
   4200000, 168000, 'Trimestriel', (now() - interval '90 days')::date, (now() + interval '275 days')::date, 'Active', 14.00,
   NULL, 50000, 1, TRUE, 'Un sinistre declare (bris hydraulique) en cours d''indemnisation.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '90 days', now() - interval '10 days'),

  -- Active, RC (fin de contrat dans 40 jours -> pre-alerte)
  ('POL-2025-RC-0099', 'c1111111-1111-1111-1111-111111111111', 'BTP Atlas SARL',
   NULL, 'SAHAM Assurance', 'Responsabilité Civile',
   2000000, 12500, 'Annuel', (now() - interval '300 days')::date, (now() + interval '40 days')::date, 'Active', 15.00,
   NULL, NULL, 0, TRUE, NULL,
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '300 days', now() - interval '300 days'),

  -- Active, bris de machine (recente, ce mois-ci)
  ('POL-2025-BM-3344', 'c1111111-1111-1111-1111-111111111111', 'BTP Atlas SARL',
   'Bulldozer Komatsu D65EX-18', 'AtlantaSanad', 'Bris de machine',
   1450000, 28900, 'Annuel', (now() - interval '20 days')::date, (now() + interval '345 days')::date, 'Active', 13.50,
   NULL, 20000, 0, TRUE, NULL,
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '20 days', now() - interval '20 days'),

  -- ALERTE : expire dans 15 jours, PAS de renouvellement auto -> a traiter
  ('POL-EXPIRE-SOON', 'c3333333-3333-3333-3333-333333333333', 'Carrieres du Doukkala',
   'Chargeuse sur pneus Volvo L120H', 'AXA Assurance Maroc', 'Tous risques',
   850000, 32500, 'Annuel', (now() - interval '350 days')::date, (now() + interval '15 days')::date, 'Active', 11.50,
   NULL, 12000, 0, FALSE, 'ALERTE renouvellement : expire bientot, auto_renewal desactive.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '350 days', now() - interval '5 days'),

  -- Devis en attente (pipeline commercial, ce mois-ci)
  ('DEV-2026-0042', 'c3333333-3333-3333-3333-333333333333', 'Carrieres du Doukkala',
   'Concasseur mobile Sandvik QJ241', 'Wafa Assurance', 'Multirisques chantier',
   2100000, 84500, 'Trimestriel', (now() + interval '5 days')::date, (now() + interval '370 days')::date, 'Devis', 14.00,
   NULL, NULL, 0, TRUE, 'Devis envoye au prospect, relance prevue.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '3 days', now() - interval '3 days'),

  -- Flotte automobile export Afrique de l'Ouest
  ('POL-2026-CI-7788', 'c5555555-5555-5555-5555-555555555555', 'Sahel Mining Cote d''Ivoire',
   'Flotte 5 vehicules de service 4x4', 'AXA Cote d''Ivoire', 'Flotte automobile',
   1800000, 96000, 'Semestriel', (now() - interval '40 days')::date, (now() + interval '325 days')::date, 'Active', 13.00,
   NULL, 25000, 0, TRUE, 'Contrat cadre flotte site minier.',
   'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1', now() - interval '40 days', now() - interval '40 days');

-- =====================================================================
-- VERIFICATION RAPIDE (optionnel — a executer apres le seed)
-- SELECT status, count(*) FROM credit_applications
--   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY status;
-- SELECT status, count(*) FROM insurance_policies
--   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' GROUP BY status;
-- SELECT count(*) FROM broker_clients
--   WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
-- =====================================================================


-- ################## METIER: Loueur d'engins (location de matériel de chantier / mine) (tables: rentals, interventions) ##################
-- =====================================================================
-- SEED DE DÉMONSTRATION — Métier LOUEUR D'ENGINS
-- Tables : rentals + interventions
-- Compte de test (RLS created_by) : a7583ae2-53a3-4668-a4e0-0b12f9eca2f1
-- Marché : Maroc / Afrique de l'Ouest — montants en MAD
-- À coller tel quel dans Supabase SQL Editor. Relançable (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) NETTOYAGE des lignes de démo de cet utilisateur (idempotence)
-- ---------------------------------------------------------------------
DELETE FROM interventions WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
DELETE FROM rentals       WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';

-- ---------------------------------------------------------------------
-- 1) RENTALS (locations)
--    Colonnes : equipment_id, client_id, start_date, end_date,
--               total_price, status, notes, created_by
--    equipment_id est rattaché à une machine réelle SI disponible,
--    sinon laissé NULL (FK ON DELETE SET NULL -> NULL toléré, le widget
--    fait un LEFT JOIN sur machines). client_id = uid de test.
--    Statuts variés : En cours / Confirmée / En préparation / Prête /
--    Terminée -> KPI (CA du mois, croissance vs mois dernier, à venir).
-- ---------------------------------------------------------------------

-- R1 : EN COURS — Pelle hydraulique (chantier autoroute Kénitra-Tanger)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines WHERE name ILIKE '%pelle%' OR name ILIKE '%excavat%' OR brand ILIKE '%CAT%' ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() - INTERVAL '4 days', NOW() + INTERVAL '11 days',
  48000.00, 'En cours', 'Pelle CAT 320 — chantier autoroute Kénitra. Chauffeur inclus.',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R2 : EN COURS — Chargeuse sur pneus (carrière granulats, Settat)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines WHERE name ILIKE '%chargeuse%' OR name ILIKE '%chargeur%' OR brand ILIKE '%JCB%' ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() - INTERVAL '2 days', NOW() + INTERVAL '5 days',
  21000.00, 'En cours', 'Chargeuse JCB 456 — carrière granulats Settat.',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R3 : PRÊTE — Grue mobile (livraison demain, chantier Casa-Anfa)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines WHERE name ILIKE '%grue%' OR name ILIKE '%crane%' OR brand ILIKE '%liebherr%' ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() + INTERVAL '1 day', NOW() + INTERVAL '6 days',
  36000.00, 'Prête', 'Grue mobile Liebherr LTM — levage charpente Casa-Anfa.',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R4 : CONFIRMÉE — Bulldozer (dans 3 jours, terrassement Marrakech)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines WHERE name ILIKE '%bulldozer%' OR name ILIKE '%bouteur%' OR name ILIKE '%D6%' ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() + INTERVAL '3 days', NOW() + INTERVAL '18 days',
  62000.00, 'Confirmée', 'Bulldozer CAT D6 — terrassement lotissement Marrakech.',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R5 : EN PRÉPARATION — Compacteur (dans 7 jours, voirie Abidjan)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines WHERE name ILIKE '%compact%' OR name ILIKE '%rouleau%' OR brand ILIKE '%bomag%' ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() + INTERVAL '7 days', NOW() + INTERVAL '22 days',
  17500.00, 'En préparation', 'Compacteur BOMAG BW213 — chantier voirie Abidjan (CI).',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R6 : TERMINÉE ce mois-ci — Tombereau (CA du mois en cours)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days',
  54000.00, 'Terminée', 'Tombereau articulé — évacuation stériles mine Bou-Azzer.',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R7 : TERMINÉE le mois dernier — (base de calcul croissance CA)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() - INTERVAL '40 days', NOW() - INTERVAL '26 days',
  29000.00, 'Terminée', 'Niveleuse — réfection piste minière Guelmim (mois précédent).',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- R8 : TERMINÉE le mois dernier — (base de calcul croissance CA)
INSERT INTO rentals (equipment_id, client_id, start_date, end_date, total_price, status, notes, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1',
  NOW() - INTERVAL '33 days', NOW() - INTERVAL '19 days',
  18500.00, 'Terminée', 'Mini-pelle — tranchées réseau Dakar (SN), mois précédent.',
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- ---------------------------------------------------------------------
-- 2) INTERVENTIONS (maintenance / réparations)
--    Colonnes : equipment_id, type, description, status, scheduled_date,
--               completed_date, technician_name, cost, created_by
--    Statuts : En attente / En cours / Terminée.
--    >>> ALERTE "retour/échéance proche" : I1 planifiée demain (En attente).
-- ---------------------------------------------------------------------

-- I1 : ALERTE — Réparation urgente PLANIFIÉE DEMAIN (En attente)
INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, technician_name, cost, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'Réparation',
  'Remplacement vérin hydraulique de flèche — panne signalée sur chantier.',
  'En attente', NOW() + INTERVAL '1 day', 'Technicien Ahmed Benali', 8500.00,
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- I2 : En cours — maintenance préventive
INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, technician_name, cost, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'Maintenance préventive',
  'Vidange moteur + remplacement filtres à air et à huile (500 h).',
  'En cours', NOW() - INTERVAL '1 day', 'Technicien Hassan El Idrissi', 3200.00,
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- I3 : En attente — contrôle dans 4 jours
INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, technician_name, cost, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'Contrôle technique',
  'Inspection réglementaire annuelle grue mobile + certificat de levage.',
  'En attente', NOW() + INTERVAL '4 days', 'Bureau Veritas', 2400.00,
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- I4 : Terminée ce mois-ci — réparation clôturée
INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, completed_date, technician_name, cost, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'Réparation',
  'Remplacement train de chenilles côté droit + galets.',
  'Terminée', NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days', 'Technicien Youssef Amrani', 14800.00,
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- I5 : Terminée le mois dernier — maintenance préventive
INSERT INTO interventions (equipment_id, type, description, status, scheduled_date, completed_date, technician_name, cost, created_by)
VALUES (
  (SELECT id FROM machines ORDER BY created_at DESC LIMIT 1),
  'Maintenance préventive',
  'Graissage général + contrôle circuit hydraulique.',
  'Terminée', NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days', 'Technicien Ahmed Benali', 1800.00,
  'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
);

-- ---------------------------------------------------------------------
-- 3) VÉRIFICATION
-- ---------------------------------------------------------------------
SELECT 'rentals' AS table_name, COUNT(*) AS n
FROM rentals WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
UNION ALL
SELECT 'interventions', COUNT(*)
FROM interventions WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
