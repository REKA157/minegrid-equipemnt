-- =====================================================================
-- SURESTARIES / DÉTENTION conteneurs (widget transitaire « Surestaries / détention »)
-- Ajoute les entrées de calcul sur freight_containers + seed sur le compte de test.
-- Surestaries = jours au-delà de la franchise × tarif/jour. Enjeu financier n°1 transitaire.
-- Idempotent. A executer dans Supabase SQL Editor.
-- =====================================================================

ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS arrival_date DATE;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS free_days INTEGER DEFAULT 7;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS demurrage_rate_per_day NUMERIC(12,2) DEFAULT 0;
ALTER TABLE freight_containers ADD COLUMN IF NOT EXISTS returned_date DATE;

-- ============ SEED surestaries (compte de test) ============
-- À quai : arrivé il y a 16 j, franchise 7 j -> ~9 j de surestaries qui courent.
UPDATE freight_containers
   SET arrival_date = (NOW() - INTERVAL '16 days')::date, free_days = 7, demurrage_rate_per_day = 950, returned_date = NULL
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND status = 'À quai';

-- Bloqué en Douane : arrivé il y a 12 j, tarif plus élevé (conteneur réfrigéré/spécial).
UPDATE freight_containers
   SET arrival_date = (NOW() - INTERVAL '12 days')::date, free_days = 7, demurrage_rate_per_day = 1200, returned_date = NULL
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND status = 'Douane';

-- Retard déchargement : arrivé il y a 9 j -> 2 j de dépassement.
UPDATE freight_containers
   SET arrival_date = (NOW() - INTERVAL '9 days')::date, free_days = 7, demurrage_rate_per_day = 800, returned_date = NULL
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND status = 'Retard';

-- Encore en mer / transbordement : arrivée prévue -> dans la franchise, à surveiller.
UPDATE freight_containers
   SET arrival_date = (NOW() + INTERVAL '4 days')::date, free_days = 7, demurrage_rate_per_day = 900, returned_date = NULL
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND status IN ('En mer', 'Transbordement');

-- Livré : conteneur restitué -> plus de surestaries en cours.
UPDATE freight_containers
   SET arrival_date = (NOW() - INTERVAL '20 days')::date, free_days = 7, demurrage_rate_per_day = 900, returned_date = (NOW() - INTERVAL '11 days')::date
 WHERE created_by = 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1' AND status = 'Livré';
