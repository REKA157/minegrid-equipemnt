-- ============================================================================
-- CONTRE-CAS p33 — recherche du catalogue côté base
-- ============================================================================
-- Prérequis : p33_recherche_catalogue.prereq.sql (schéma minimal + jeu d'essai
-- reproduisant les prix RÉELS observés en production : espaces, unité collée,
-- « Sur demande », vide, NULL, et une chaîne à deux points décimaux).
--
-- Chaque cas affiche ATTENDU puis OBTENU. Un écart doit sauter aux yeux.
-- ============================================================================

\echo ''
\echo '=== CAS 1 — un prix propre est converti en nombre ==='
\echo 'ATTENDU : Hitachi ZX350 -> 450000'
select name, price, price_num from public.machines_catalogue where name = 'Hitachi ZX350';

\echo ''
\echo '=== CAS 2 — les espaces dans le prix ne cassent pas la conversion ==='
\echo 'ATTENDU : CAT 140K (« 1 250 000 ») -> 1250000'
select name, price, price_num from public.machines_catalogue where name = 'CAT 140K';

\echo ''
\echo '=== CAS 3 — une unité collée au prix est ignorée ==='
\echo 'ATTENDU : Komatsu PC210 (« 95 000 EUR ») -> 95000'
select name, price, price_num from public.machines_catalogue where name = 'Komatsu PC210';

\echo ''
\echo '=== CAS 4 — un prix NON numérique donne NULL, jamais 0 ==='
\echo 'ATTENDU : les 4 lignes ci-dessous ont price_num = NULL (t)'
\echo 'Un 0 ici ferait apparaitre ces annonces dans un filtre « moins de 1000 EUR ».'
select name, coalesce(price, '(null)') as price, (price_num is null) as prix_inconnu
from public.machines_catalogue
where name in ('Grue sans prix', 'Prix vide', 'Prix nul', 'Prix pourri')
order by name;

\echo ''
\echo '=== CAS 5 — le filtre par prix ne ramène QUE des prix connus ==='
\echo 'ATTENDU : 2 lignes (Volvo 120000.50 et Hitachi 450000). Aucune des 4 sans prix.'
select count(*) as nb_resultats
from public.machines_catalogue
where price_num >= 100000 and price_num <= 500000;

\echo ''
\echo '=== CAS 6 — le tri par prix croissant est NUMERIQUE, pas alphabétique ==='
\echo 'ATTENDU dans cet ordre : Komatsu 95000, Volvo 120000.50, Hitachi 450000, CAT 1250000'
\echo 'Un tri alphabetique sur le texte mettrait « 1 250 000 » en premier.'
select name, price_num
from public.machines_catalogue
where price_num is not null
order by price_num asc;

\echo ''
\echo '=== CAS 7 — la liste des marques est COMPLETE, avec les comptes ==='
\echo 'ATTENDU : 8 marques (Bomag, CAT, Doosan, Hitachi, Hyundai, Komatsu, Liebherr, Volvo)'
select jsonb_array_length(public.catalogue_facettes()->'marques') as nb_marques,
       public.catalogue_facettes()->>'total' as total_annonces;

\echo ''
\echo 'ATTENDU : chaque marque avec son nombre, triee alphabetiquement'
select x->>'valeur' as marque, x->>'nombre' as nombre
from jsonb_array_elements(public.catalogue_facettes()->'marques') x;

\echo ''
\echo '=== CAS 8 — les categories aussi ==='
\echo 'ATTENDU : 4 categories (compacteur, grue-mobile, niveleuse, pelle-chenilles)'
select x->>'valeur' as categorie, x->>'nombre' as nombre
from jsonb_array_elements(public.catalogue_facettes()->'categories') x;

\echo ''
\echo '=== CAS 9 — SECURITE : la vue respecte la RLS de l appelant ==='
\echo 'On restreint la lecture aux annonces d un seul vendeur, puis on relit la VUE.'
\echo 'ATTENDU : la vue ne montre QUE les annonces autorisees. Si elle en montre 8,'
\echo 'c est que security_invoker ne fonctionne pas et que la vue contourne la RLS.'

drop policy if exists machines_lecture_publique on public.machines;
drop policy if exists machines_un_seul_vendeur on public.machines;   -- rejouable
create policy machines_un_seul_vendeur on public.machines for select to anon
  using (sellerid = '11111111-1111-1111-1111-111111111111'::uuid);

update public.machines set sellerid = '11111111-1111-1111-1111-111111111111'::uuid
  where name in ('Hitachi ZX350', 'Volvo G940');
update public.machines set sellerid = '22222222-2222-2222-2222-222222222222'::uuid
  where sellerid is null;

set role anon;
select count(*) as visibles_par_la_table from public.machines;
select count(*) as visibles_par_la_vue   from public.machines_catalogue;
\echo 'ATTENDU : les deux comptes valent 2. Un 8 sur la vue = FUITE DE DONNEES.'
reset role;

\echo ''
\echo '=== CAS 10 — la fonction de facettes respecte aussi la RLS ==='
set role anon;
select public.catalogue_facettes()->>'total' as total_vu_par_anon;
\echo 'ATTENDU : 2. Un 8 signifie que la fonction ignore la RLS.'
reset role;

\echo ''
\echo '=== CAS 11 — l index sur le prix est bien UTILISE ==='
\echo 'ATTENDU : le plan mentionne « idx_machines_price_num ».'
\echo 'S il fait un « Seq Scan », l expression de l index differe de celle de la vue.'
set enable_seqscan = off;
explain (costs off) select id from public.machines_catalogue where price_num > 100000;
set enable_seqscan = on;

\echo ''
\echo '=== CAS 12 — MUTATION : la vue SANS security_invoker doit fuiter ==='
\echo 'On recree volontairement la vue sans l option, pour prouver que le CAS 9'
\echo 'mord vraiment. Sans cette verification, le CAS 9 passerait meme si'
\echo 'security_invoker ne servait a rien.'
create or replace view public.machines_catalogue_mutee as
  select m.* from public.machines m;          -- PAS de security_invoker
grant select on public.machines_catalogue_mutee to anon;
set role anon;
select count(*) as par_la_table from public.machines;
select count(*) as par_la_vue_mutee from public.machines_catalogue_mutee;
reset role;
\echo 'ATTENDU : par_la_table = 2, par_la_vue_mutee = 8.'
\echo 'Deux chiffres EGAUX ici signifieraient que le CAS 9 ne prouve rien.'
drop view public.machines_catalogue_mutee;

\echo ''
\echo '=== FIN DES CONTRE-CAS p33 ==='
