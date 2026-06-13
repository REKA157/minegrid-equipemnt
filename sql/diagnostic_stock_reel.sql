-- =====================================================================
-- DIAGNOSTIC « STOCK RÉEL » — à coller dans Supabase > SQL Editor
-- =====================================================================
-- Objectif investisseur : répondre à LA question qui décide si l'actif
-- marketplace existe — combien d'annonces RÉELLES, de vendeurs RÉELS, et
-- combien d'abonnements ont été accordés SANS paiement (à nettoyer après le
-- correctif). Lecture seule : aucune écriture, aucun risque.
--
-- Mode d'emploi : exécuter bloc par bloc. Certaines colonnes vendeur varient
-- selon l'historique (sellerid / seller_id / user_id / owner_id) ; le bloc 0
-- liste les colonnes réelles pour ajuster les blocs suivants si besoin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BLOC 0 — Colonnes réelles de `machines` (pour ajuster les requêtes)
-- ---------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'machines'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------
-- BLOC 1 — Volume du catalogue (la métrique n°1)
-- ---------------------------------------------------------------------
SELECT
  count(*)                                              AS total_annonces,
  count(*) FILTER (WHERE created_at > now() - interval '90 days') AS ajoutees_90j,
  count(*) FILTER (WHERE created_at > now() - interval '30 days') AS ajoutees_30j
FROM public.machines;

-- ---------------------------------------------------------------------
-- BLOC 2 — Qualité du prix (price stocké en TEXT → corruption en 0)
--   Compte les annonces dont le prix n'est PAS un nombre exploitable.
-- ---------------------------------------------------------------------
SELECT
  count(*)                                                          AS total,
  count(*) FILTER (WHERE price IS NULL OR btrim(price::text) = '')  AS prix_vide,
  count(*) FILTER (WHERE price::text !~ '^[0-9]+([.,][0-9]+)?$')    AS prix_non_numerique,
  count(*) FILTER (WHERE price::text ~ '^[0-9]+([.,][0-9]+)?$'
                    AND replace(price::text, ',', '.')::numeric = 0) AS prix_zero
FROM public.machines;

-- ---------------------------------------------------------------------
-- BLOC 3 — Origine des annonces : scrapées vs déposées manuellement
--   (si la colonne `source` existe ; sinon ignorer ce bloc)
-- ---------------------------------------------------------------------
SELECT
  coalesce(source, '(manuel / sans source)') AS origine,
  count(*)                                    AS nb
FROM public.machines
GROUP BY 1
ORDER BY nb DESC;

-- ---------------------------------------------------------------------
-- BLOC 4 — Vendeurs réels vs vendeur fantôme du scraper
--   Le scraper Mascus écrit l'UUID 00000000-0000-0000-0000-000000000001.
--   Adapter la liste de colonnes au résultat du BLOC 0 si nécessaire.
-- ---------------------------------------------------------------------
WITH attrib AS (
  SELECT
    coalesce(sellerid, seller_id, user_id, owner_id) AS seller
  FROM public.machines
)
SELECT
  count(*)                                                                   AS annonces_total,
  count(*) FILTER (WHERE seller IS NULL)                                     AS sans_vendeur,
  count(*) FILTER (WHERE seller = '00000000-0000-0000-0000-000000000001')    AS vendeur_fantome_scraper,
  count(DISTINCT seller) FILTER (
    WHERE seller IS NOT NULL
      AND seller <> '00000000-0000-0000-0000-000000000001'
  )                                                                          AS vendeurs_reels_distincts
FROM attrib;

-- ---------------------------------------------------------------------
-- BLOC 5 — Comptes vendeurs / utilisateurs
-- ---------------------------------------------------------------------
SELECT 'auth.users'     AS source, count(*) AS nb FROM auth.users
UNION ALL
SELECT 'pro_clients'    AS source, count(*) FROM public.pro_clients;

-- ---------------------------------------------------------------------
-- BLOC 6 — ABONNEMENTS ACCORDÉS SANS PAIEMENT (à nettoyer après le fix)
--   Détecte les lignes pro_clients « active » qui n'ont pas de trace de
--   paiement Stripe : promo, carte simulée, démo, auto-création. Ce sont
--   les bénéficiaires du contournement à examiner/désactiver.
-- ---------------------------------------------------------------------
SELECT
  subscription_status,
  coalesce(payment_method, '(aucun)') AS methode_paiement,
  count(*)                            AS nb
FROM public.pro_clients
GROUP BY 1, 2
ORDER BY nb DESC;

-- Détail des abonnements actifs SANS PaymentIntent Stripe (à auditer) :
SELECT user_id, subscription_type, subscription_status, payment_method,
       subscription_start, subscription_end
FROM public.pro_clients
WHERE subscription_status = 'active'
  AND (stripe_payment_intent_id IS NULL OR payment_method <> 'stripe')
ORDER BY subscription_start DESC NULLS LAST
LIMIT 200;

-- ---------------------------------------------------------------------
-- BLOC 7 — Demande : leads et messages de contact (traction côté demande)
-- ---------------------------------------------------------------------
SELECT 'quote_requests'   AS flux, count(*) AS nb FROM public.quote_requests
UNION ALL
SELECT 'contact_messages' AS flux, count(*) FROM public.contact_messages;

-- =====================================================================
-- LECTURE INVESTISSEUR
--   - vendeurs_reels_distincts < ~10  → pas encore d'offre : priorité absolue
--   - vendeur_fantome_scraper >> annonces réelles → catalogue = scraping (risque légal)
--   - prix_non_numerique + prix_zero élevés → fiches non transactionnelles
--   - BLOC 6 : toute ligne active sans Stripe = revenu fictif à retirer
-- =====================================================================
