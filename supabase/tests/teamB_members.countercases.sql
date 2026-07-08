-- =====================================================================
-- CONTRE-CAS : scope + résolution des noms de get_org_members()
-- (charger après prereq + migration). 'postgres' (superuser) sème ;
-- SET ROLE authenticated + test.uid incarne un client. Un échec d'assertion
-- -> raise exception -> ON_ERROR_STOP sort en code != 0.
--
-- UUID :
--   org A = 0a…0001            org B = 0b…0002
--   userA1 …00a1 owner A (metas camelCase firstName/lastName/phone)
--   userA2 …00a2 manager A (metas full_name SEUL)
--   userA3 …00a3 viewer A (metas vides -> retombe sur l'email, jamais connecté)
--   userB1 …00b1 owner B
--   userX  …00ff non-membre
-- =====================================================================

-- ---------- Semis (superuser) ----------
insert into auth.users (id, email, last_sign_in_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@societeA.ma', now() - interval '1 hour',
     '{"firstName":"Amine","lastName":"Alaoui","phone":"+212600000001"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@societeA.ma', now() - interval '2 day',
     '{"full_name":"Fatima Zahra"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@societeA.ma', null,
     '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@societeB.ma', now(),
     '{"firstName":"Bruno","lastName":"Bennani"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000ff', 'x@nowhere.ma',   now(),
     '{}'::jsonb);

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'manager'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'viewer'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- ============ CONTRE-CAS 1 (CRITIQUE) : A ne voit QUE les membres de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; n_b int; begin
  select count(*) into n from public.get_org_members();
  if n <> 3 then raise exception '1 ECHEC: userA1 devrait voir 3 membres, en voit %', n; end if;
  select count(*) into n_b from public.get_org_members()
   where organization_id = '0b000000-0000-0000-0000-000000000002'
      or user_id = '00000000-0000-0000-0000-0000000000b1';
  if n_b <> 0 then raise exception '1 FUITE: userA1 voit % membre(s) de la societe B', n_b; end if;
  raise notice 'OK 1: societe A voit ses 3 membres et AUCUN de la societe B';
end $$;

-- ---------- POSITIF 1 : nom camelCase (firstName/lastName), tel, derniere connexion ----------
do $$ declare r record; begin
  select * into r from public.get_org_members() where user_id = '00000000-0000-0000-0000-0000000000a1';
  if r.first_name <> 'Amine'  then raise exception '2 ECHEC: prenom camelCase non resolu (%)', r.first_name; end if;
  if r.last_name  <> 'Alaoui' then raise exception '2 ECHEC: nom camelCase non resolu (%)', r.last_name; end if;
  if r.email <> 'a1@societeA.ma' then raise exception '2 ECHEC: email non resolu (%)', r.email; end if;
  if r.phone <> '+212600000001' then raise exception '2 ECHEC: telephone non resolu (%)', r.phone; end if;
  if r.role  <> 'owner' then raise exception '2 ECHEC: role incorrect (%)', r.role; end if;
  if r.last_sign_in_at is null then raise exception '2 ECHEC: derniere connexion non resolue'; end if;
  raise notice 'OK 2: metadata camelCase (prenom/nom/tel) + email + derniere connexion resolus';
end $$;

-- ---------- POSITIF 2 : full_name SEUL retombe dans first_name ----------
do $$ declare r record; begin
  select * into r from public.get_org_members() where user_id = '00000000-0000-0000-0000-0000000000a2';
  if r.first_name <> 'Fatima Zahra' then raise exception '3 ECHEC: full_name non repris dans first_name (%)', r.first_name; end if;
  if r.last_name is not null then raise exception '3 ECHEC: last_name devrait etre NULL (full_name seul)'; end if;
  if r.role <> 'manager' then raise exception '3 ECHEC: role incorrect (%)', r.role; end if;
  raise notice 'OK 3: full_name seul -> first_name (le frontend affichera le nom complet)';
end $$;

-- ---------- POSITIF 3 : metadata vide -> nom NULL, email depuis auth.users, jamais connecte ----------
do $$ declare r record; begin
  select * into r from public.get_org_members() where user_id = '00000000-0000-0000-0000-0000000000a3';
  if r.first_name is not null then raise exception '4 ECHEC: first_name devrait etre NULL (metadata vide)'; end if;
  if r.email <> 'a3@societeA.ma' then raise exception '4 ECHEC: email auth.users non resolu (%)', r.email; end if;
  if r.last_sign_in_at is not null then raise exception '4 ECHEC: last_sign_in_at devrait etre NULL (jamais connecte)'; end if;
  raise notice 'OK 4: metadata vide -> nom NULL, email depuis auth.users, jamais connecte';
end $$;

-- ---------- POSITIF 4 : tri owner -> admin -> manager -> viewer ----------
do $$ declare first_role text; begin
  select role into first_role from public.get_org_members() limit 1;
  if first_role <> 'owner' then raise exception '5 ECHEC: le 1er membre devrait etre owner (%)', first_role; end if;
  raise notice 'OK 5: tri par role (owner en tete)';
end $$;
reset role;

-- ---------- POSITIF 5 : un membre NON-admin (manager) voit aussi toute l'equipe ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare n int; begin
  select count(*) into n from public.get_org_members();
  if n <> 3 then raise exception '6 ECHEC: un manager devrait voir les 3 membres, en voit %', n; end if;
  raise notice 'OK 6: un membre non-admin voit toute son equipe';
end $$;
reset role;

-- ============ CONTRE-CAS 2 : B ne voit QUE B (symetrie) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.get_org_members();
  if n <> 1 then raise exception '7 ECHEC: userB1 devrait voir 1 membre, en voit %', n; end if;
  select count(*) into n from public.get_org_members()
   where organization_id = '0a000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception '7 FUITE: userB1 voit des membres de la societe A'; end if;
  raise notice 'OK 7: societe B ne voit que son unique membre (symetrie)';
end $$;
reset role;

-- ============ CONTRE-CAS 3 : un NON-MEMBRE ne voit personne ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000ff';
do $$ declare n int; begin
  select count(*) into n from public.get_org_members();
  if n <> 0 then raise exception '8 ECHEC: un non-membre voit % membre(s) (devrait etre 0)', n; end if;
  raise notice 'OK 8: un utilisateur sans societe ne voit aucun membre';
end $$;
reset role;

-- ============ CONTRE-CAS 4 : search_path verrouille sur get_org_members ============
do $$ begin
  perform 1 from pg_proc p
   where p.proname = 'get_org_members'
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '9 ECHEC: get_org_members n''a pas search_path=public verrouille'; end if;
  raise notice 'OK 9: search_path=public verrouille sur get_org_members';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
