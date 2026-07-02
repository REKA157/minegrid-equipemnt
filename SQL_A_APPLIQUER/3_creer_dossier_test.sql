-- ============================================================
--   CRÉER UN DOSSIER DE TEST  (pour voir le write-side marcher)
-- ============================================================
--
-- AVANT DE LANCER : remplace  TON_EMAIL_ICI@exemple.com  ci-dessous
-- par l'email de TON compte MineGrid (celui avec lequel tu es
-- connecté sur le site localhost:5175).
--
-- À lancer dans Supabase > SQL Editor > New query > Run.
-- Le résultat affiche l'ID du dossier + l'URL à ouvrir.
-- ============================================================

with moi as (
  select id
  from auth.users
  where lower(email) = lower('TON_EMAIL_ICI@exemple.com')
  limit 1
)
insert into public.transaction_cases (seller_user_id, status, title, notes)
select id, 'qualified',
       'Dossier de test (démo write-side)',
       'Créé manuellement pour tester inspection + assignation partenaire. Supprimable.'
from moi
returning
  id as dossier_id,
  'http://localhost:5175/#dossier/' || id as url_a_ouvrir;

-- Si le résultat est VIDE (0 ligne) : l'email saisi n'existe pas
-- dans auth.users -> vérifie que c'est bien l'email de ton compte.

-- Pour supprimer ce dossier de test plus tard :
--   delete from public.transaction_cases where title = 'Dossier de test (démo write-side)';
