-- =====================================================================
-- KM À VIDE / COÛT DU RETOUR À VIDE (widget transporteur « deadhead-cost »)
-- Ajoute les colonnes de calcul sur deliveries + seed sur le compte de test.
-- Retour à vide = km sans fret au retour × coût/km complet = coût sec non facturé.
-- Taux de vide = km à vide / (km charge + km vide). Enjeu marge n°1 du transport routier.
-- RLS existante : deliveries.created_by = auth.uid() (voir deploy_transporteur.sql).
-- Idempotent. À exécuter dans Supabase SQL Editor (après deploy_transporteur.sql).
-- =====================================================================

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS distance_loaded_km NUMERIC(10,2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS distance_empty_km  NUMERIC(10,2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cost_per_km        NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_deliveries_empty_km ON deliveries(distance_empty_km);

-- ==================== SEED (compte de test) ====================
-- L'API transporteur scope par created_by = compte (RLS stricte).
-- Idempotent : purge par marqueur dans notes, puis réinsertion.
DELETE FROM deliveries
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'
   AND notes = 'seed-demo-deadhead';

INSERT INTO deliveries (
  equipment_label, origin_address, destination_address,
  pickup_date, expected_delivery_date,
  distance_km, distance_loaded_km, distance_empty_km, cost_per_km, transport_cost,
  status, priority, client_name, notes, created_by
)
VALUES
  -- CAS VOLONTAIREMENT MAUVAIS : retour 100% à vide = 50% du trajet aller-retour -> au-dessus du seuil, trajet en alerte le plus coûteux (rouge)
  ('Pelle Caterpillar 336', 'Dépôt Casablanca', 'Site Khouribga',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day 18 hours',
   240, 240, 240, 22, 5280,
   'Livrée', 'Haute', 'OCP Khouribga', 'seed-demo-deadhead', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- SAIN : ~39% à vide (juste SOUS le seuil 40%) -> ne déclenche pas l'alerte, mais coût du vide élevé en absolu
  ('Bulldozer Komatsu D85', 'Dépôt Casablanca', 'Chantier Agadir',
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days 12 hours',
   510, 510, 320, 21, 17430,
   'Livrée', 'Moyenne', 'BTP Souss', 'seed-demo-deadhead', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- Moyen : ~44% à vide (juste au-dessus du seuil -> alerte)
  ('Chargeuse Volvo L150', 'Dépôt Casablanca', 'Carrière El Jadida',
   NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days 20 hours',
   105, 105, 82, 20, 3740,
   'Livrée', 'Basse', 'Carrières du Doukkala', 'seed-demo-deadhead', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- BON : fret retour trouvé, ~13% à vide (sous le seuil -> vert)
  ('Camion-benne Mercedes Arocs', 'Dépôt Casablanca', 'Chantier Marrakech',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days 18 hours',
   240, 240, 30, 21, 5670,
   'Livrée', 'Moyenne', 'BTP Atlas', 'seed-demo-deadhead', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- EXEMPLAIRE : retour chargé (0 km à vide) -> ne pénalise pas (contrôle)
  ('Niveleuse Caterpillar 140', 'Dépôt Casablanca', 'Site Settat',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '18 hours',
   90, 90, 0, 20, 1800,
   'Livrée', 'Basse', 'Routes du Centre', 'seed-demo-deadhead', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1'),
  -- ANNULÉE : ne doit PAS être comptée (contrôle honnêteté / filtre statut)
  ('Compacteur Bomag', 'Dépôt Casablanca', 'Chantier Berrechid',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day 20 hours',
   60, 60, 60, 20, 0,
   'Annulée', 'Basse', 'TP Berrechid', 'seed-demo-deadhead', 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1');

-- ==================== VÉRIFICATION ====================
SELECT equipment_label, distance_loaded_km, distance_empty_km, cost_per_km,
       ROUND(distance_empty_km / NULLIF(distance_loaded_km + distance_empty_km, 0) * 100) AS taux_vide_pct,
       ROUND(distance_empty_km * cost_per_km) AS cout_vide_mad, status
FROM deliveries
WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND notes = 'seed-demo-deadhead'
ORDER BY cout_vide_mad DESC;