-- ============================================================
--   PRÉPARER LE DOSSIER DE TEST POUR LA DÉMO ESCROW (lecture/écriture légère)
-- ============================================================
-- Le pont escrow exige un dossier RÉEL : acheteur + montant + machine
-- (anti-façade : pas d'escrow fictif). Ton dossier de test n'a aucun des trois.
-- Ce script complète le dossier "Dossier de test (démo write-side)" pour
-- pouvoir cliquer « Ouvrir le séquestre » dans l'interface.
--
-- Note : on met acheteur = vendeur (toi) uniquement pour la démo locale.
-- À lancer dans Supabase > SQL Editor > Run.
-- ============================================================

update public.transaction_cases c
   set buyer_user_id = coalesce(c.buyer_user_id, c.seller_user_id),  -- toi comme acheteur (démo)
       total_amount  = coalesce(nullif(c.total_amount, 0), 250000),  -- montant démo
       machine_id    = coalesce(c.machine_id, (select id from public.machines order by created_at desc limit 1)),
       currency      = coalesce(c.currency, 'MAD')
 where c.title = 'Dossier de test (démo write-side)'
returning c.id, c.buyer_user_id, c.total_amount, c.machine_id;

-- Ensuite, dans l'app (page du dossier) :
--   1. clique « Ouvrir le séquestre (escrow réel) » -> crée un escrow 'created'
--      ET, par le pont, met à jour la ligne paiement du dossier (escrow_transaction_id + statut).
--   2. vérifie avec SQL_A_APPLIQUER/9_validation_pont_escrow.sql
--      (escrow_transactions count = 1) et la timeline (event 'escrow.synced').
