-- ============================================================
--   DONNER UN ACCÈS "ENTREPRISE" DE TEST À TON COMPTE
--   (pour voir les cockpits métier : mécanicien, etc.)
-- ============================================================
--
-- Les cockpits métier sont réservés aux abonnés "entreprise".
-- L'écriture sur pro_clients est bloquée pour les utilisateurs (sécurité),
-- MAIS l'éditeur SQL de Supabase tourne en mode admin -> il peut écrire.
--
-- AVANT DE LANCER : vérifie que l'email ci-dessous est bien celui de
-- ton compte MineGrid (remplace-le si besoin).
-- À lancer dans Supabase > SQL Editor > Run.
-- ============================================================

-- ÉTAPE A — on essaie d'abord de METTRE À JOUR la ligne si elle existe.
update public.pro_clients
   set subscription_type   = 'enterprise',
       subscription_status = 'active',
       subscription_end    = null
 where user_id = (select id from auth.users
                  where lower(email) = lower('riqa890@gmail.com'));

-- Regarde le message en bas à droite de Supabase :
--   "UPDATE 1"  -> c'est bon, ton compte est passé en entreprise. Ignore l'étape B.
--   "UPDATE 0"  -> tu n'avais pas encore de ligne pro_clients : lance l'ÉTAPE B
--                  ci-dessous (enlève les -- devant les lignes du bloc INSERT).


-- ÉTAPE B — à utiliser SEULEMENT si l'étape A a affiché "UPDATE 0".
-- (Si l'insert se plaint d'une colonne manquante "not-null", copie-moi
--  le message d'erreur et je l'ajoute.)
--
-- insert into public.pro_clients (user_id, subscription_type, subscription_status, subscription_end)
-- select id, 'enterprise', 'active', null
--   from auth.users
--  where lower(email) = lower('riqa890@gmail.com');


-- POUR REVENIR EN ARRIÈRE plus tard (retirer l'accès de test) :
--   update public.pro_clients set subscription_status = 'inactive'
--    where user_id = (select id from auth.users where lower(email) = lower('riqa890@gmail.com'));
