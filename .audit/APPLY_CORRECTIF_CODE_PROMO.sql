-- =====================================================================
-- CORRECTIF — Code promo (et webhook Paddle) : index UNIQUE manquant sur pro_clients.user_id
-- =====================================================================
-- BUG, prouvé : redeem_promo_code (et paddle-webhook) activent l'abonnement par
--   INSERT INTO pro_clients ... ON CONFLICT (user_id) DO UPDATE
-- Or en PRODUCTION, pro_clients.user_id n'a qu'un index SIMPLE (idx_pro_clients_user_id),
-- PAS de contrainte/index UNIQUE. Postgres lève alors :
--   ERROR 42P10 : there is no unique or exclusion constraint matching the ON CONFLICT specification
-- -> TOUTE rédemption de code promo échoue (« le code promo ne fonctionne pas »).
--
-- Preuve Docker (2026-10-02) : sur un pro_clients identique à la prod (index simple),
--   l'appel plante ; après ce correctif, l'utilisateur 1 obtient {"ok": true} et
--   l'abonnement passe « active », 2e rédemption = « déjà utilisé » (plus de plantage).
--
-- Le correctif existait déjà dans 20260717100000_paddle_payments.sql mais n'avait
-- jamais été appliqué. Idempotent. À exécuter dans Supabase SQL Editor :
-- STAGING d'abord, puis PROD.
-- =====================================================================

-- 1) Dédoublonnage de sécurité : si des doublons existent (rien ne les empêchait),
--    on garde la ligne la plus récente par utilisateur, sinon l'index unique échouerait.
delete from public.pro_clients p
 where exists (
   select 1 from public.pro_clients q
    where q.user_id = p.user_id
      and (q.updated_at > p.updated_at
           or (q.updated_at = p.updated_at and q.id > p.id))
 );

-- 2) Index UNIQUE sur user_id — ce que « ON CONFLICT (user_id) » exige.
create unique index if not exists pro_clients_user_id_key
  on public.pro_clients (user_id);

-- Vérif (optionnelle) : doit renvoyer 1 ligne 'pro_clients_user_id_key'.
--   select indexname from pg_indexes where tablename='pro_clients' and indexdef ilike '%unique%user_id%';
