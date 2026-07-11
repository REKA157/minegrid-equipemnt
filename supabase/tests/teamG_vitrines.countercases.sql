-- =====================================================================
-- CONTRE-CAS : RLS `vitrines` (charger après prereq + migration).
-- 'postgres' (superuser) sème ; SET ROLE authenticated + test.uid incarne un
-- client. Échec d'assertion -> raise exception -> ON_ERROR_STOP sort != 0.
--
-- userA = …00a1  (propriétaire de la vitrine)
-- userB = …00b1  (autre utilisateur — ne doit RIEN pouvoir modifier chez A)
-- =====================================================================

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');

-- ============ POSITIF 1 : A insère sa vitrine ; le trigger FORCE user_id = A ============
-- (même si le client tente de mettre user_id = B, l'insert est forcé à A)
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v_owner uuid; begin
  insert into public.vitrines (user_id, company_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'Société A'); -- user_id menteur
  select user_id into v_owner from public.vitrines where company_name = 'Société A';
  if v_owner is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception '1 ECHEC: le trigger devrait forcer user_id = A, obtenu %', v_owner;
  end if;
  raise notice 'OK 1: insert force le proprietaire a A (anti-usurpation)';
end $$;
reset role;

-- ============ POSITIF 2 : A modifie SA vitrine ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  update public.vitrines set company_name = 'Société A (modifiée)'
   where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '2 ECHEC: A devrait modifier sa vitrine (n=%)', n; end if;
  raise notice 'OK 2: le proprietaire modifie sa vitrine';
end $$;
reset role;

-- ============ CONTRE-CAS 1 (CRITIQUE) : B ne peut PAS modifier la vitrine de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; v_name text; begin
  update public.vitrines set company_name = 'PIRATÉ PAR B'
   where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '3 FUITE: B a modifie % ligne(s) de la vitrine de A', n; end if;
  -- vérifie que le contenu de A est intact
  reset role; -- lecture superuser pour vérifier sans RLS
  select company_name into v_name from public.vitrines where user_id = '00000000-0000-0000-0000-0000000000a1';
  if v_name = 'PIRATÉ PAR B' then raise exception '3 FUITE: la vitrine de A a ete alteree par B'; end if;
  raise notice 'OK 3: B ne peut pas modifier la vitrine de A (RLS)';
end $$;

-- ============ CONTRE-CAS 2 : B ne peut PAS supprimer la vitrine de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  delete from public.vitrines where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '4 FUITE: B a supprime % vitrine(s) de A', n; end if;
  raise notice 'OK 4: B ne peut pas supprimer la vitrine de A (RLS)';
end $$;
reset role;

-- ============ CONTRE-CAS 3 : B ne peut PAS insérer une vitrine au nom de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare v_owner uuid; begin
  -- le trigger force user_id = B ; la vitrine cree appartient a B, pas a A
  insert into public.vitrines (user_id, company_name)
  values ('00000000-0000-0000-0000-0000000000a1', 'Vitrine de B');
  select user_id into v_owner from public.vitrines where company_name = 'Vitrine de B';
  if v_owner is distinct from '00000000-0000-0000-0000-0000000000b1' then
    raise exception '5 ECHEC: la vitrine creee par B devrait appartenir a B, obtenu %', v_owner;
  end if;
  raise notice 'OK 5: B ne peut creer qu''une vitrine a SON nom (trigger)';
end $$;
reset role;

-- ============ POSITIF 3 : lecture PUBLIQUE (anon voit les vitrines) ============
set role anon;
set test.uid = '';
do $$ declare n int; begin
  select count(*) into n from public.vitrines;
  if n < 2 then raise exception '6 ECHEC: la lecture publique devrait voir les vitrines (n=%)', n; end if;
  raise notice 'OK 6: lecture publique des vitrines (catalogue public)';
end $$;
reset role;

-- ============ CONTRE-CAS 4 : search_path verrouillé sur le trigger ============
do $$ begin
  perform 1 from pg_proc p where p.proname = 'vitrines_force_owner_fn'
    and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '7 ECHEC: search_path=public non verrouille sur vitrines_force_owner_fn'; end if;
  raise notice 'OK 7: search_path=public verrouille sur le trigger';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
