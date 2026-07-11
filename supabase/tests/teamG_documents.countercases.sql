-- =====================================================================
-- CONTRE-CAS : RLS `documents` (privés). Charger après prereq + migration.
-- userA = …00a1 (propriétaire) ; userB = …00b1 (ne doit RIEN voir/toucher chez A).
-- Le document de A a un id FIXE pour tester la suppression par id seul.
-- =====================================================================

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');

-- ============ POSITIF 1 : A insère un doc ; le trigger FORCE user_id = A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v_owner uuid; begin
  insert into public.documents (id, user_id, name)
  values ('0d000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'Doc de A'); -- user_id menteur
  select user_id into v_owner from public.documents where id = '0d000000-0000-0000-0000-0000000000a1';
  if v_owner is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception '1 ECHEC: le trigger devrait forcer user_id = A, obtenu %', v_owner;
  end if;
  raise notice 'OK 1: insert force le proprietaire a A';
end $$;
reset role;

-- ============ POSITIF 2 : A voit SON document ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.documents;
  if n <> 1 then raise exception '2 ECHEC: A devrait voir son doc (n=%)', n; end if;
  raise notice 'OK 2: A voit son propre document';
end $$;
reset role;

-- ============ CONTRE-CAS 1 (CRITIQUE) : B ne VOIT PAS les documents de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.documents;
  if n <> 0 then raise exception '3 FUITE: B voit % document(s) de A (devrait etre 0)', n; end if;
  raise notice 'OK 3: B ne voit AUCUN document de A (docs prives)';
end $$;
reset role;

-- ============ CONTRE-CAS 2 : B ne peut PAS supprimer le doc de A (même par id seul) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  delete from public.documents where id = '0d000000-0000-0000-0000-0000000000a1'; -- id connu, sans user_id
  get diagnostics n = row_count;
  if n <> 0 then raise exception '4 FUITE: B a supprime % doc(s) de A', n; end if;
  raise notice 'OK 4: B ne peut pas supprimer le doc de A (RLS, meme par id)';
end $$;
reset role;

-- ============ CONTRE-CAS 3 : B ne peut PAS modifier le doc de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  update public.documents set name = 'PIRATÉ' where id = '0d000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '5 FUITE: B a modifie % doc(s) de A', n; end if;
  raise notice 'OK 5: B ne peut pas modifier le doc de A (RLS)';
end $$;
reset role;

-- ============ POSITIF 3 : A supprime SON document ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  delete from public.documents where id = '0d000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '6 ECHEC: A devrait supprimer son doc (n=%)', n; end if;
  raise notice 'OK 6: A supprime son propre document';
end $$;
reset role;

-- ============ CONTRE-CAS 4 : search_path verrouillé sur le trigger ============
do $$ begin
  perform 1 from pg_proc p where p.proname = 'documents_force_owner_fn'
    and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '7 ECHEC: search_path=public non verrouille sur documents_force_owner_fn'; end if;
  raise notice 'OK 7: search_path=public verrouille sur le trigger';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
