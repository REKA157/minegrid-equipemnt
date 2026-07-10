-- =====================================================================
-- CONTRE-CAS : affectation par membre (organization_member_scopes)
-- (charger après prereq + migration teamF). 'postgres' (superuser) sème ;
-- SET ROLE authenticated + test.uid incarne un client. Échec d'assertion
-- -> raise exception -> ON_ERROR_STOP sort en code != 0.
--
-- UUID :
--   org A = 0a…01              org B = 0b…02
--   a1 …00a1 owner A           a2 …00a2 manager A (NON-admin)
--   a3 …00a3 viewer A          b1 …00b1 owner B      b2 …00b2 viewer B
-- =====================================================================

-- ---------- Semis (superuser) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@societeA.ma'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@societeA.ma'),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@societeA.ma'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@societeB.ma'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@societeB.ma');

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'manager'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'viewer'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'viewer');

-- ============ POSITIF 1 : un admin règle un membre de SA société ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  perform public.set_member_scope('00000000-0000-0000-0000-0000000000a3', true, false);
  select commercial, tenders into r
    from public.organization_member_scopes
   where user_id = '00000000-0000-0000-0000-0000000000a3';
  if r.commercial is distinct from true or r.tenders is distinct from false then
    raise exception '1 ECHEC: affectation a3 attendue (t,f), obtenue (%,%)', r.commercial, r.tenders;
  end if;
  raise notice 'OK 1: admin A a affecte a3 en Commercial seul (t,f)';
end $$;
reset role;

-- ============ POSITIF 2 : get_my_member_scope reflète l'affectation ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a3';
do $$ declare r record; begin
  select commercial, tenders into r from public.get_my_member_scope();
  if r.commercial is distinct from true or r.tenders is distinct from false then
    raise exception '2 ECHEC: get_my_member_scope(a3) attendu (t,f), obtenu (%,%)', r.commercial, r.tenders;
  end if;
  raise notice 'OK 2: a3 lit sa propre affectation (t,f)';
end $$;
reset role;

-- ============ POSITIF 3 : défaut = accès aux DEUX si aucune ligne ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare r record; begin
  select commercial, tenders into r from public.get_my_member_scope();
  if r.commercial is distinct from true or r.tenders is distinct from true then
    raise exception '3 ECHEC: sans ligne, defaut attendu (t,t), obtenu (%,%)', r.commercial, r.tenders;
  end if;
  raise notice 'OK 3: membre sans affectation explicite -> acces aux deux (t,t)';
end $$;
reset role;

-- ============ CONTRE-CAS 1 (CRITIQUE) : admin A ne règle PAS un membre de B ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    perform public.set_member_scope('00000000-0000-0000-0000-0000000000b2', true, false);
    raise exception '4 ECHEC: admin A a pu regler un membre de la societe B';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK 4: admin A refuse sur un membre de la societe B (%)', sqlerrm;
  end;
end $$;
reset role;

-- ============ CONTRE-CAS 2 : un NON-admin (manager) ne règle personne ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin
    perform public.set_member_scope('00000000-0000-0000-0000-0000000000a3', false, true);
    raise exception '5 ECHEC: un manager (non-admin) a pu regler une affectation';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK 5: un non-admin ne peut pas regler d''affectation (%)', sqlerrm;
  end;
end $$;
reset role;

-- ============ CONTRE-CAS 3 : le PROPRIÉTAIRE garde toujours les deux ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  perform public.set_member_scope('00000000-0000-0000-0000-0000000000a1', false, true); -- tente de retirer Commercial
  select commercial, tenders into r from public.get_my_member_scope();
  if r.commercial is distinct from true or r.tenders is distinct from true then
    raise exception '6 ECHEC: owner devrait garder (t,t), obtenu (%,%)', r.commercial, r.tenders;
  end if;
  raise notice 'OK 6: owner force a garder l''acces aux deux (anti-verrouillage)';
end $$;
reset role;

-- ============ CONTRE-CAS 4 : au moins une affectation (non-owner) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    perform public.set_member_scope('00000000-0000-0000-0000-0000000000a3', false, false);
    raise exception '7 ECHEC: on a pu retirer les DEUX affectations d''un membre';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK 7: interdit de tout retirer (au moins une affectation) (%)', sqlerrm;
  end;
end $$;
reset role;

-- ============ CONTRE-CAS 5 : RLS — A ne lit PAS les affectations de B ============
-- b1 (admin B) affecte b2, puis a3 (membre A) ne doit RIEN voir de la societe B.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  perform public.set_member_scope('00000000-0000-0000-0000-0000000000b2', true, false);
end $$;
reset role;

set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a3';
do $$ declare n_b int; n_a int; begin
  select count(*) into n_b from public.organization_member_scopes
   where organization_id = '0b000000-0000-0000-0000-000000000002';
  if n_b <> 0 then raise exception '8 FUITE: membre A voit % affectation(s) de la societe B', n_b; end if;
  select count(*) into n_a from public.organization_member_scopes
   where organization_id = '0a000000-0000-0000-0000-000000000001';
  if n_a < 1 then raise exception '8 ECHEC: membre A devrait voir les affectations de SA societe'; end if;
  raise notice 'OK 8: RLS isole les affectations par societe (voit A, jamais B)';
end $$;
reset role;

-- ============ CONTRE-CAS 6 : search_path verrouillé sur les fonctions ============
do $$ begin
  perform 1 from pg_proc p where p.proname in ('get_my_member_scope', 'set_member_scope')
    and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '9 ECHEC: search_path=public non verrouille sur une fonction scope'; end if;
  raise notice 'OK 9: search_path=public verrouille sur get_my_member_scope et set_member_scope';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
