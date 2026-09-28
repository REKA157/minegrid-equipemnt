-- =====================================================================
-- COMPARATEUR MULTI-BANQUES (widget courtier « Comparateur multi-banques »)
-- Table de reference des banques partenaires + baremes (taux, duree max, frais).
-- RLS calquee sur broker_clients / credit_applications (auth.uid() = created_by).
-- + SEED des principales banques marocaines pour le compte de test.
-- Idempotent. A executer dans Supabase SQL Editor.
-- =====================================================================

-- Fonction updated_at (deja creee par deploy_courtier.sql ; recreee ici pour autonomie)
CREATE OR REPLACE FUNCTION courtier_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS bank_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT '';
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS annual_rate NUMERIC(5, 2) DEFAULT 0;      -- taux annuel %
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS max_duration_months INTEGER DEFAULT 84;   -- duree max financable
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS file_fees NUMERIC(12, 2) DEFAULT 0;        -- frais de dossier MAD
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS min_amount NUMERIC(14, 2);                 -- montant min finançable
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS max_amount NUMERIC(14, 2);                 -- montant max finançable
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE bank_offers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_bank_offers_created_by ON bank_offers(created_by);
CREATE INDEX IF NOT EXISTS idx_bank_offers_active ON bank_offers(active);
CREATE INDEX IF NOT EXISTS idx_bank_offers_rate ON bank_offers(annual_rate);

DROP TRIGGER IF EXISTS trg_bank_offers_updated_at ON bank_offers;
CREATE TRIGGER trg_bank_offers_updated_at
  BEFORE UPDATE ON bank_offers
  FOR EACH ROW EXECUTE FUNCTION courtier_set_updated_at();

ALTER TABLE bank_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_offers_select_own ON bank_offers;
CREATE POLICY bank_offers_select_own ON bank_offers FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS bank_offers_insert_own ON bank_offers;
CREATE POLICY bank_offers_insert_own ON bank_offers FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS bank_offers_update_own ON bank_offers;
CREATE POLICY bank_offers_update_own ON bank_offers FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS bank_offers_delete_own ON bank_offers;
CREATE POLICY bank_offers_delete_own ON bank_offers FOR DELETE
  USING (auth.uid() = created_by);

-- =====================================================================
-- SEED : baremes des principales banques marocaines (compte de test)
-- Taux / frais indicatifs pour le financement d'equipement (leasing / credit).
-- =====================================================================
DO $$
DECLARE
  v_user_id UUID := 'a7583ae2-53a3-4668-a4e0-0b12f9eca2f1';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE NOTICE 'Compte de test introuvable — skip seed bank_offers';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bank_offers WHERE created_by = v_user_id AND bank_name = 'Attijariwafa Bank') THEN
    INSERT INTO bank_offers (bank_name, annual_rate, max_duration_months, file_fees, min_amount, max_amount, active, notes, created_by)
    VALUES ('Attijariwafa Bank', 5.80, 84, 4500, 100000, 8000000, TRUE, 'Leasing engins BTP — taux preferentiel gros dossiers', v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bank_offers WHERE created_by = v_user_id AND bank_name = 'Bank of Africa') THEN
    INSERT INTO bank_offers (bank_name, annual_rate, max_duration_months, file_fees, min_amount, max_amount, active, notes, created_by)
    VALUES ('Bank of Africa', 6.95, 72, 3500, 80000, 5000000, TRUE, 'Credit acquisition materiel — reactivite dossier', v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bank_offers WHERE created_by = v_user_id AND bank_name = 'Banque Populaire') THEN
    INSERT INTO bank_offers (bank_name, annual_rate, max_duration_months, file_fees, min_amount, max_amount, active, notes, created_by)
    VALUES ('Banque Populaire', 6.50, 60, 3000, 50000, 4000000, TRUE, 'Forte implantation regionale — PME/TPE', v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bank_offers WHERE created_by = v_user_id AND bank_name = 'CIH Bank') THEN
    INSERT INTO bank_offers (bank_name, annual_rate, max_duration_months, file_fees, min_amount, max_amount, active, notes, created_by)
    VALUES ('CIH Bank', 6.20, 84, 2500, 100000, 6000000, TRUE, 'Frais de dossier reduits', v_user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bank_offers WHERE created_by = v_user_id AND bank_name = 'Societe Generale Maroc') THEN
    INSERT INTO bank_offers (bank_name, annual_rate, max_duration_months, file_fees, min_amount, max_amount, active, notes, created_by)
    VALUES ('Societe Generale Maroc', 6.75, 72, 4000, 150000, 7000000, TRUE, 'Financement flottes et materiel lourd', v_user_id);
  END IF;

  RAISE NOTICE 'Seed bank_offers cree/mis a jour pour user_id=%', v_user_id;
END $$;

-- =====================================================================
-- VERIFICATION FINALE
-- =====================================================================
DO $$
DECLARE
  v_offers INT;
BEGIN
  SELECT COUNT(*) INTO v_offers FROM bank_offers;
  RAISE NOTICE '✅ Comparateur multi-banques : % offres bancaires en base', v_offers;
END $$;