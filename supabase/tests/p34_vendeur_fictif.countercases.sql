-- ============================================================================
-- CONTRE-CAS p34 — le vendeur fictif ne peut plus entrer dans la chaîne
-- ============================================================================
-- Prérequis : p34_vendeur_fictif.prereq.sql
-- Chaque cas affiche ATTENDU puis OBTENU. Un écart doit sauter aux yeux.
-- ============================================================================

\echo ''
\echo '=== CAS 1 — la fonction reconnaît les deux identifiants fictifs ==='
\echo 'ATTENDU : t, t, f, f'
select public.est_vendeur_fictif('00000000-0000-0000-0000-000000000000') as zero,
       public.est_vendeur_fictif('00000000-0000-0000-0000-000000000001') as un,
       public.est_vendeur_fictif('11111111-1111-1111-1111-111111111111') as vendeur_reel,
       public.est_vendeur_fictif(null)                                   as valeur_nulle;

\echo ''
\echo '=== CAS 2 — une demande de devis vers le fantôme est CONSERVÉE, vendeur effacé ==='
\echo 'ATTENDU : la ligne existe, seller_id = NULL (t). Le lead ne doit PAS etre perdu.'
insert into public.quote_requests (id, machine_id, seller_id, buyer_user_id, buyer_name, buyer_email)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        'Karim', 'karim@exemple.ma');
select buyer_name, (seller_id is null) as vendeur_efface
from public.quote_requests where id = 'cccccccc-0000-0000-0000-000000000001';

\echo ''
\echo '=== CAS 3 — une demande vers un VRAI vendeur n est pas touchée ==='
\echo 'ATTENDU : seller_id = 11111111-1111-1111-1111-111111111111'
insert into public.quote_requests (id, machine_id, seller_id, buyer_user_id, buyer_name, buyer_email)
values ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        'Karim', 'karim@exemple.ma');
select seller_id from public.quote_requests where id = 'cccccccc-0000-0000-0000-000000000002';

\echo ''
\echo '=== CAS 4 — la MISE A JOUR vers le fantôme est aussi normalisée ==='
\echo 'ATTENDU : seller_id reste NULL (t) apres une tentative de remise du fantome.'
update public.quote_requests
   set seller_id = '00000000-0000-0000-0000-000000000001'
 where id = 'cccccccc-0000-0000-0000-000000000002';
select (seller_id is null) as reste_null
from public.quote_requests where id = 'cccccccc-0000-0000-0000-000000000002';

\echo ''
\echo '=== CAS 5 — un DOSSIER avec vendeur fantôme est REFUSÉ ==='
\echo 'ATTENDU : une erreur 23514 avec un message comprehensible par un humain.'
\echo 'Un dossier orphelin porte un montant, des participants et personne en face.'
do $cas5$
begin
  insert into public.transaction_cases (kind, status, machine_id, seller_user_id, buyer_user_id, total_amount)
  values ('sale', 'draft', 'aaaaaaaa-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 450000);
  raise warning 'ECHEC DU CONTRE-CAS : le dossier orphelin a ete CREE.';
exception when others then
  raise notice 'OK refuse -> [%] %', sqlstate, sqlerrm;
end
$cas5$;
select count(*) as dossiers_orphelins
from public.transaction_cases where public.est_vendeur_fictif(seller_user_id);

\echo ''
\echo '=== CAS 6 — un dossier avec un VRAI vendeur passe normalement ==='
\echo 'ATTENDU : 1 dossier cree.'
insert into public.transaction_cases (kind, status, machine_id, seller_user_id, buyer_user_id, total_amount)
values ('sale', 'draft', 'bbbbbbbb-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 320000);
select count(*) as dossiers_valides
from public.transaction_cases where seller_user_id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '=== CAS 7 — on ne peut pas non plus BASCULER un dossier vers le fantôme ==='
\echo 'ATTENDU : erreur. Sans cela, on contournerait le controle en deux temps.'
do $cas7$
begin
  update public.transaction_cases
     set seller_user_id = '00000000-0000-0000-0000-000000000001'
   where seller_user_id = '11111111-1111-1111-1111-111111111111';
  raise warning 'ECHEC DU CONTRE-CAS : la bascule vers le fantome a ete acceptee.';
exception when others then
  raise notice 'OK refuse -> [%] %', sqlstate, sqlerrm;
end
$cas7$;

\echo ''
\echo '=== CAS 8 — LE POINT DECISIF : le declencheur s applique AUSSI au superutilisateur ==='
\echo 'Une politique RLS ne s applique PAS au role de service. Un declencheur, si.'
\echo 'C est la raison d etre de ce choix : le controle tient quel que soit l appelant.'
select current_user as role_courant, usesuper as est_superutilisateur
from pg_user where usename = current_user;
do $cas8$
begin
  insert into public.transaction_cases (kind, status, seller_user_id, buyer_user_id)
  values ('sale', 'draft', '00000000-0000-0000-0000-000000000000',
          '22222222-2222-2222-2222-222222222222');
  raise warning 'ECHEC DU CONTRE-CAS : le superutilisateur a contourne le declencheur.';
exception when others then
  raise notice 'OK refuse meme en superutilisateur -> [%] %', sqlstate, sqlerrm;
end
$cas8$;

\echo ''
\echo '=== CAS 9 — aucune donnée existante n a été modifiée par la migration ==='
\echo 'ATTENDU : les 2 annonces d origine sont intactes, fantome compris.'
select count(*) filter (where public.est_vendeur_fictif(seller_id)) as annonces_fantome,
       count(*)                                                      as annonces_total
from public.machines;

\echo ''
\echo '=== FIN DES CONTRE-CAS p34 ==='
