-- =====================================================================
-- CONTRE-CAS p25 : appartenance à une société (C1 sécurité, C2 société
-- manquante, C3 limite de sièges).
-- 'postgres' (superuser) sème ; SET ROLE authenticated + test.uid incarne un
-- client. Échec d'assertion -> raise exception -> ON_ERROR_STOP sort != 0.
--
-- ENT = société abonnée Enterprise (5 sièges) / PREM = abonnée Premium (1 siège)
-- =====================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'patron@ent.ma'),   -- owner ENT
  ('00000000-0000-0000-0000-0000000000e9', 'lecteur@ent.ma'),  -- viewer ENT
  ('00000000-0000-0000-0000-0000000000b1', 'patron@prem.ma'),  -- owner PREM
  ('00000000-0000-0000-0000-0000000000d1', 'intrus@ailleurs.ma'),
  ('00000000-0000-0000-0000-0000000000ca', 'nouveau@client.ma'),
  ('00000000-0000-0000-0000-0000000000cb', 'nouveau2@client.ma'),
  ('00000000-0000-0000-0000-000000000011', 'c1@ent.ma'),
  ('00000000-0000-0000-0000-000000000012', 'c2@ent.ma'),
  ('00000000-0000-0000-0000-000000000013', 'c3@ent.ma'),
  ('00000000-0000-0000-0000-000000000014', 'c4@ent.ma');

insert into public.organizations (id, name) values
  ('0e000000-0000-0000-0000-000000000001', 'Société ENT'),
  ('0f000000-0000-0000-0000-000000000002', 'Société PREM');

insert into public.organization_members (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9', 'viewer'),
  ('0f000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

insert into public.pro_clients (user_id, company_name, subscription_type, subscription_status, max_users) values
  ('00000000-0000-0000-0000-0000000000e1', 'Société ENT',  'enterprise', 'active', 5),
  ('00000000-0000-0000-0000-0000000000b1', 'Société PREM', 'premium',    'active', 1);

-- ============ CC1 : C1 — un intrus ne peut PLUS s'inscrire dans une société ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000d1';   -- intrus, membre de rien
do $$ begin
  begin
    insert into public.organization_members (organization_id, user_id, role)
    values ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'owner');
    raise exception '1 ECHEC: un intrus a pu se declarer PROPRIETAIRE de la societe ENT';
  exception when insufficient_privilege or sqlstate '42501' then
    raise notice 'OK 1: l''auto-inscription dans une societe est refusee (42501)';
  end;
end $$;

-- ---------- CC2 : la règle permissive n'existe plus (état, pas comportement) ----------
reset role;
do $$ declare n integer; begin
  n := (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'organization_members'
          and cmd = 'INSERT');
  if n <> 0 then raise exception '2 ECHEC: il reste % regle(s) d''ecriture sur organization_members', n; end if;
  n := (select count(*) from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'organization_members'
          and grantee in ('anon', 'authenticated')
          and privilege_type in ('INSERT', 'UPDATE', 'DELETE'));
  if n <> 0 then raise exception '2 ECHEC: il reste % droit(s) d''ecriture publics', n; end if;
  raise notice 'OK 2: plus aucune regle ni aucun droit d''ecriture publics sur organization_members';
end $$;

-- ---------- CC3 : C2 — un nouveau client obtient SA société (et une seule) ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000ca';
do $$ declare v1 uuid; v2 uuid; v_role text; begin
  v1 := public.ensure_my_organization();
  if v1 is null then raise exception '3 ECHEC: aucune societe creee pour un nouveau client'; end if;
  v_role := (select role from public.organization_members
             where organization_id = v1 and user_id = '00000000-0000-0000-0000-0000000000ca');
  if v_role <> 'owner' then raise exception '3 ECHEC: le nouveau client n''est pas proprietaire (%)', v_role; end if;
  v2 := public.ensure_my_organization();
  if v2 <> v1 then raise exception '3 ECHEC: deuxieme appel = deuxieme societe (% vs %)', v2, v1; end if;
  raise notice 'OK 3: la societe du nouveau client est creee, une seule fois (idempotent)';
end $$;

-- ---------- CC4 : C2 — devenir client (pro_clients) crée la société automatiquement ----------
reset role;
insert into public.pro_clients (user_id, company_name, subscription_type, subscription_status, max_users)
values ('00000000-0000-0000-0000-0000000000cb', 'Nouvelle SARL', 'enterprise', 'active', 5);
do $$ declare v_org uuid; v_name text; begin
  v_org := (select organization_id from public.organization_members
            where user_id = '00000000-0000-0000-0000-0000000000cb' and role = 'owner');
  if v_org is null then raise exception '4 ECHEC: aucune societe creee a l''activation de l''abonnement'; end if;
  v_name := (select name from public.organizations where id = v_org);
  if v_name <> 'Nouvelle SARL' then raise exception '4 ECHEC: mauvais nom de societe (%)', v_name; end if;
  raise notice 'OK 4: l''activation d''un abonnement cree la societe (nommee d''apres le client)';
end $$;

-- ---------- CC5 : C3 — Enterprise = 5 sièges, déjà 2 membres : 3 invitations, la 4e refusée ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000e1';   -- owner ENT
do $$ declare r record; i integer; begin
  -- ENT compte déjà 2 membres (le patron + le lecteur) : il reste 3 places.
  for i in 1..3 loop
    select * into r from public.create_invitation('c' || i || '@ent.ma', 'Collegue ' || i, 'viewer');
    if r.token is null then raise exception '5 ECHEC: invitation % refusee alors qu''un siege est libre', i; end if;
    if i = 1 then
      insert into public._teststate(k, v) values ('tok1', r.token)
        on conflict (k) do update set v = excluded.v;
    end if;
  end loop;
  raise notice 'OK 5a: 3 invitations acceptees (2 membres + 3 = 5 sieges, le forfait est plein)';

  begin
    perform public.create_invitation('detrop@ent.ma', 'De Trop', 'viewer');
    raise exception '5 ECHEC: une invitation de trop est passee malgre la limite de 5 sieges';
  exception when sqlstate '42501' then
    raise notice 'OK 5b: la 6e place est refusee (limite du forfait Enterprise)';
  end;
end $$;

-- ---------- CC6 : C3 — la fuite de revenus : Premium = 1 siège, aucune invitation ----------
set test.uid = '00000000-0000-0000-0000-0000000000b1';   -- owner PREM
do $$ begin
  begin
    perform public.create_invitation('ami@gratuit.ma', 'Ami', 'viewer');
    raise exception '6 ECHEC: un abonne Premium (1 siege) a pu inviter un collegue (abonnement partage gratuitement)';
  exception when sqlstate '42501' then
    raise notice 'OK 6: un forfait a 1 siege ne peut inviter personne';
  end;
end $$;

-- ---------- CC7 : C3 — rétrogradation du forfait : l'acceptation est refusée ----------
reset role;
update public.pro_clients set max_users = 1 where user_id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000011';   -- c1@ent.ma, invité
do $$ declare v_tok text; begin
  v_tok := (select v from public._teststate where k = 'tok1');
  begin
    perform public.accept_invitation(v_tok);
    raise exception '7 ECHEC: acceptation possible alors que la societe n''a plus de siege libre';
  exception when sqlstate '42501' then
    raise notice 'OK 7: apres retrogradation, l''acceptation est refusee';
  end;
end $$;

-- ---------- CC8 : le parcours légitime fonctionne toujours ----------
reset role;
update public.pro_clients set max_users = 5 where user_id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000011';
do $$ declare r record; v_tok text; begin
  v_tok := (select v from public._teststate where k = 'tok1');
  select * into r from public.accept_invitation(v_tok);
  if r.organization_id <> '0e000000-0000-0000-0000-000000000001' then
    raise exception '8 ECHEC: rattachement a la mauvaise societe (%)', r.organization_id; end if;
  if not exists (select 1 from public.organization_members
                 where organization_id = '0e000000-0000-0000-0000-000000000001'
                   and user_id = '00000000-0000-0000-0000-000000000011') then
    raise exception '8 ECHEC: l''invite n''est pas devenu membre'; end if;
  raise notice 'OK 8: dans la limite du forfait, l''invitation s''accepte normalement';
end $$;

-- ---------- CC9 : un simple lecteur ne peut toujours pas inviter (et n'obtient pas de société) ----------
set test.uid = '00000000-0000-0000-0000-0000000000e9';   -- viewer ENT
do $$ declare n integer; begin
  begin
    perform public.create_invitation('x@x.ma', 'X', 'viewer');
    raise exception '9 ECHEC: un lecteur a pu inviter';
  exception when sqlstate '42501' then
    null;
  end;
  n := (select count(*) from public.organization_members
        where user_id = '00000000-0000-0000-0000-0000000000e9');
  if n <> 1 then raise exception '9 ECHEC: une societe parasite a ete creee pour le lecteur (% rattachements)', n; end if;
  raise notice 'OK 9: un lecteur ne peut pas inviter, et aucune societe parasite n''est creee';
end $$;

reset role;
do $$ begin raise notice 'TOUS LES CONTRE-CAS PASSES'; end $$;
