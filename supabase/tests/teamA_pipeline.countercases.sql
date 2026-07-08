-- =====================================================================
-- CONTRE-CAS RLS « société » du pipeline (à charger après prereq + migration).
-- 'postgres' (superuser) = service_role ; SET ROLE authenticated = client.
-- Un échec d'assertion -> raise exception -> ON_ERROR_STOP sort en code != 0.
--
-- UUID :
--   org A = 0a000000-…-0001   org B = 0b000000-…-0002
--   userA1 …00a1 (owner A + vendeur leadA)   userA2 …00a2 (manager A)
--   userA3 …00a3 (viewer A)                  userB1 …00b1 (owner B + vendeur leadB)
--   leadA …aaa1 (org A)                      leadB …bbb1 (org B)
-- =====================================================================

-- ---------- Semis (service_role / superuser ; auth.uid() = NULL -> trigger neutre) ----------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b1');

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'manager'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'viewer'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

insert into public.leads (id, seller_id, title, organization_id, assigned_to_user_id) values
  ('00000000-0000-0000-0000-00000000aaa1', '00000000-0000-0000-0000-0000000000a1', 'Lead société A',
   '0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000bbb1', '00000000-0000-0000-0000-0000000000b1', 'Lead société B',
   '0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1');

-- ============ CONTRE-CAS 1 (CRITIQUE) : A ne voit JAMAIS les leads de B ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.leads
   where organization_id = '0b000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception '1 FUITE: userA1 voit % lead(s) de la societe B', n; end if;
  -- accès direct par id : idem, invisible.
  select count(*) into n from public.leads where id = '00000000-0000-0000-0000-00000000bbb1';
  if n <> 0 then raise exception '1 FUITE: userA1 voit le lead B par id'; end if;
  raise notice 'OK 1: societe A ne voit AUCUN lead de societe B';
end $$;

-- ---------- POSITIF 1 : A voit bien les leads de SA société ----------
do $$ declare n int; begin
  select count(*) into n from public.leads
   where organization_id = '0a000000-0000-0000-0000-000000000001';
  if n < 1 then raise exception '2 ECHEC: userA1 ne voit pas les leads de sa societe (n=%)', n; end if;
  raise notice 'OK 2: userA1 voit les leads de sa societe (n=%)', n;
end $$;
reset role;

-- ---------- POSITIF 2 : un MEMBRE non-vendeur voit le lead (visibilité équipe) ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare n int; begin
  select count(*) into n from public.leads where id = '00000000-0000-0000-0000-00000000aaa1';
  if n <> 1 then raise exception '3 ECHEC: le manager A ne voit pas leadA (partage equipe casse), n=%', n; end if;
  raise notice 'OK 3: un membre non-vendeur de la societe voit le lead (partage equipe)';
end $$;
reset role;

-- ============ CONTRE-CAS 2 : A ne peut PAS modifier un lead de B (sans effet) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
update public.leads set title = 'PIRATE' where id = '00000000-0000-0000-0000-00000000bbb1';
reset role;
do $$ declare t text; begin
  select title into t from public.leads where id = '00000000-0000-0000-0000-00000000bbb1';
  if t <> 'Lead société B' then raise exception '4 ECHEC: userA1 a modifie un lead de la societe B (title=%)', t; end if;
  raise notice 'OK 4: UPDATE d''un lead de B par A = sans effet (RLS)';
end $$;

-- ---------- POSITIF 3 : le VENDEUR modifie son lead ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
update public.leads set title = 'Lead A (maj vendeur)' where id = '00000000-0000-0000-0000-00000000aaa1';
reset role;
do $$ declare t text; begin
  select title into t from public.leads where id = '00000000-0000-0000-0000-00000000aaa1';
  if t <> 'Lead A (maj vendeur)' then raise exception '5 ECHEC: le vendeur ne peut pas modifier son lead (title=%)', t; end if;
  raise notice 'OK 5: le vendeur modifie son lead';
end $$;

-- ---------- POSITIF 4 : un ADMIN/MANAGER de la société modifie le lead ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
update public.leads set title = 'Lead A (maj manager)' where id = '00000000-0000-0000-0000-00000000aaa1';
reset role;
do $$ declare t text; begin
  select title into t from public.leads where id = '00000000-0000-0000-0000-00000000aaa1';
  if t <> 'Lead A (maj manager)' then raise exception '6 ECHEC: le manager ne peut pas modifier un lead de sa societe (title=%)', t; end if;
  raise notice 'OK 6: un manager de la societe modifie le lead';
end $$;

-- ---------- CONTRE-CAS 3 : un VIEWER ne peut PAS modifier (lecture seule) ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a3';
update public.leads set title = 'VIEWER-HACK' where id = '00000000-0000-0000-0000-00000000aaa1';
reset role;
do $$ declare t text; begin
  select title into t from public.leads where id = '00000000-0000-0000-0000-00000000aaa1';
  if t = 'VIEWER-HACK' then raise exception '7 ECHEC: un viewer a pu modifier le lead'; end if;
  raise notice 'OK 7: un viewer ne peut pas modifier (reste %))', t;
end $$;

-- ============ CONTRE-CAS 4 : pas d'INJECTION inter-société à l'INSERT ============
-- userA1 tente d'insérer un lead dans la société B -> le trigger force la société A.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
insert into public.leads (id, seller_id, title, organization_id)
values ('00000000-0000-0000-0000-00000000ccc1', '00000000-0000-0000-0000-0000000000a1', 'Tentative injection',
        '0b000000-0000-0000-0000-000000000002');
reset role;
do $$ declare org uuid; begin
  select organization_id into org from public.leads where id = '00000000-0000-0000-0000-00000000ccc1';
  if org <> '0a000000-0000-0000-0000-000000000001' then
    raise exception '8 ECHEC: injection inter-societe a l''insert (organization_id=%)', org;
  end if;
  raise notice 'OK 8: organization_id force a la societe du createur (pas d''injection)';
end $$;

-- ============ CONTRE-CAS 5 : pas de DÉPLACEMENT inter-société à l'UPDATE ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
update public.leads set organization_id = '0b000000-0000-0000-0000-000000000002'
 where id = '00000000-0000-0000-0000-00000000aaa1';
reset role;
do $$ declare org uuid; begin
  select organization_id into org from public.leads where id = '00000000-0000-0000-0000-00000000aaa1';
  if org <> '0a000000-0000-0000-0000-000000000001' then
    raise exception '9 ECHEC: un lead a ete deplace vers une autre societe (organization_id=%)', org;
  end if;
  raise notice 'OK 9: organization_id immuable cote client (pas de deplacement)';
end $$;

-- ============ CONTRE-CAS 6 : search_path verrouillé sur les fonctions SECURITY DEFINER ============
do $$ begin
  perform 1 from pg_proc p
   where p.proname in ('can_access_lead','user_in_org','user_in_org_admin','leads_guard_fn')
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '10 ECHEC: une fonction n''a pas search_path=public verrouille'; end if;
  raise notice 'OK 10: search_path=public verrouille sur les fonctions SECURITY DEFINER';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
