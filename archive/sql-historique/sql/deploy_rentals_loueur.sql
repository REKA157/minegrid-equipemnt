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
