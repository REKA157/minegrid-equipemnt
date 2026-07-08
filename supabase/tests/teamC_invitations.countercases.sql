-- =====================================================================
-- CONTRE-CAS : invitations par lien (create_invitation / accept_invitation).
-- 'postgres' (superuser) sème ; SET ROLE authenticated + test.uid incarne un
-- client. Échec d'assertion -> raise exception -> ON_ERROR_STOP sort != 0.
--
-- org A = 0a…0001 / org B = 0b…0002
-- a1 owner A / a2 admin A / a3 viewer A / b1 owner B
-- c (…00c1, c@new.ma) invité / d (…00d1, d@other.ma) intrus / e (…00e1) expiré
-- =====================================================================

-- Après migration, l'écriture directe est RÉVOQUÉE : `authenticated` n'a plus
-- que SELECT (les écritures passent par les fonctions SECURITY DEFINER). On
-- reflète cet état ici ; CC6 prouve d'ailleurs que l'INSERT direct est refusé.
grant select on public.user_invitations to authenticated;

-- ---------- Semis (superuser) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@a.ma'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@a.ma'),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@a.ma'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@b.ma'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@new.ma'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@other.ma'),
  ('00000000-0000-0000-0000-0000000000e1', 'exp@a.ma');

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'viewer'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- ============ CC1 : un admin crée une invitation pour SA société ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';   -- admin A
do $$ declare r record; begin
  select * into r from public.create_invitation('c@new.ma', 'Collegue C', 'viewer');
  if r.token is null then raise exception '1 ECHEC: pas de token genere'; end if;
  if r.organization_id <> '0a000000-0000-0000-0000-000000000001' then
    raise exception '1 ECHEC: invitation rattachee a la mauvaise societe (%)', r.organization_id; end if;
  if r.role <> 'viewer' then raise exception '1 ECHEC: role incorrect (%)', r.role; end if;
  insert into public._teststate(k, v) values ('tok', r.token)
    on conflict (k) do update set v = excluded.v;
  raise notice 'OK 1: un admin cree une invitation pour SA societe (token genere)';
end $$;

-- ---------- CC2 : un VIEWER ne peut PAS inviter ----------
set test.uid = '00000000-0000-0000-0000-0000000000a3';   -- viewer A
do $$ begin
  begin
    perform public.create_invitation('x@x.ma', 'X', 'viewer');
    raise exception '2 ECHEC: un viewer a pu creer une invitation';
  exception when sqlstate '42501' then
    raise notice 'OK 2: un viewer ne peut PAS inviter (42501)';
  end;
end $$;

-- ---------- CC3 : rôle non invitable (owner) refusé ----------
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin
    perform public.create_invitation('y@y.ma', 'Y', 'owner');
    raise exception '3 ECHEC: role owner accepte a l invitation';
  exception when sqlstate '22023' then
    raise notice 'OK 3: on ne peut pas inviter un owner (role invalide)';
  end;
end $$;

-- ---------- CC4 : inviter quelqu'un DÉJÀ membre est refusé ----------
do $$ begin
  begin
    perform public.create_invitation('a3@a.ma', 'Deja la', 'viewer');
    raise exception '4 ECHEC: invitation d un membre existant acceptee';
  exception when sqlstate '23505' then
    raise notice 'OK 4: inviter un membre existant est refuse';
  end;
end $$;
reset role;

-- ============ CC5 : RLS — un admin d'une AUTRE société ne voit pas l'invitation ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';   -- owner B
do $$ declare n int; begin
  select count(*) into n from public.user_invitations where email = 'c@new.ma';
  if n <> 0 then raise exception '5 FUITE: l admin de B voit l invitation de A (n=%)', n; end if;
  raise notice 'OK 5: un admin d une autre societe ne voit pas l invitation (RLS)';
end $$;
reset role;

-- ---------- POSITIF : l'admin de A voit bien SON invitation ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare n int; begin
  select count(*) into n from public.user_invitations where email = 'c@new.ma';
  if n <> 1 then raise exception '5b ECHEC: l admin de A ne voit pas son invitation (n=%)', n; end if;
  raise notice 'OK 5b: l admin de A voit son invitation';
end $$;

-- ============ CC6 : INSERT direct dans user_invitations refusé (RLS, aucune policy insert) ============
do $$ begin
  begin
    insert into public.user_invitations (organization_id, email, role, token, status)
    values ('0a000000-0000-0000-0000-000000000001', 'z@z.ma', 'viewer', 'ZTOKEN', 'pending');
    raise exception '6 ECHEC: INSERT direct autorise (contournement des fonctions)';
  exception when insufficient_privilege then
    raise notice 'OK 6: INSERT direct refuse (RLS) -> tout passe par create_invitation';
  end;
end $$;
reset role;

-- ============ CC7 : accepter SANS être connecté (uid null) refusé ============
set role authenticated;
set test.uid = '';   -- auth.uid() = NULL
do $$ declare tok text; begin
  select v into tok from public._teststate where k = 'tok';
  begin
    perform public.accept_invitation(tok);
    raise exception '7 ECHEC: accept sans connexion a reussi';
  exception when sqlstate '28000' then
    raise notice 'OK 7: accepter sans connexion est refuse';
  end;
end $$;

-- ============ CC8 : accepter avec le MAUVAIS email refusé ============
set test.uid = '00000000-0000-0000-0000-0000000000d1';   -- d@other.ma (pas l invité)
do $$ declare tok text; begin
  select v into tok from public._teststate where k = 'tok';
  begin
    perform public.accept_invitation(tok);
    raise exception '8 ECHEC: accept avec un email different a reussi';
  exception when sqlstate '42501' then
    raise notice 'OK 8: accepter avec un email different est refuse';
  end;
end $$;
reset role;
-- l'intrus n'est pas devenu membre.
do $$ declare n int; begin
  select count(*) into n from public.organization_members
   where organization_id = '0a000000-0000-0000-0000-000000000001'
     and user_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 0 then raise exception '8b FUITE: l intrus est devenu membre'; end if;
  raise notice 'OK 8b: l intrus n est pas membre';
end $$;

-- ============ CC9 : accepter avec le BON email -> devient membre (rôle prévu) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';   -- c@new.ma (l invité)
do $$ declare r record; tok text; begin
  select v into tok from public._teststate where k = 'tok';
  select * into r from public.accept_invitation(tok);
  if r.organization_id <> '0a000000-0000-0000-0000-000000000001' then
    raise exception '9 ECHEC: rattache a la mauvaise societe (%)', r.organization_id; end if;
  if r.role <> 'viewer' then raise exception '9 ECHEC: mauvais role (%)', r.role; end if;
  raise notice 'OK 9: l invite accepte et rejoint la societe avec le bon role';
end $$;
reset role;
do $$ declare n int; st text; begin
  select count(*) into n from public.organization_members
   where organization_id = '0a000000-0000-0000-0000-000000000001'
     and user_id = '00000000-0000-0000-0000-0000000000c1' and role = 'viewer';
  if n <> 1 then raise exception '9b ECHEC: l invite n est pas rattache correctement (n=%)', n; end if;
  select status into st from public.user_invitations where email = 'c@new.ma';
  if st <> 'accepted' then raise exception '9b ECHEC: invitation pas marquee accepted (%)', st; end if;
  raise notice 'OK 9b: membre cree + invitation marquee accepted';
end $$;

-- ============ CC10 : rejeu — accepter une invitation déjà consommée refusé ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ declare tok text; begin
  select v into tok from public._teststate where k = 'tok';
  begin
    perform public.accept_invitation(tok);
    raise exception '10 ECHEC: rejeu d une invitation acceptee a reussi';
  exception when sqlstate '22023' then
    raise notice 'OK 10: rejeu d une invitation deja utilisee refuse';
  end;
end $$;
reset role;

-- ============ CC11 : invitation EXPIRÉE refusée ============
-- Semis d'une invitation périmée (superuser bypass RLS).
insert into public.user_invitations (organization_id, email, role, token, status, expires_at)
values ('0a000000-0000-0000-0000-000000000001', 'exp@a.ma', 'viewer', 'EXPTOKEN',
        'pending', now() - interval '1 day');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000e1';   -- exp@a.ma
do $$ begin
  begin
    perform public.accept_invitation('EXPTOKEN');
    raise exception '11 ECHEC: accept d une invitation expiree a reussi';
  exception when sqlstate '22023' then
    raise notice 'OK 11: invitation expiree refusee';
  end;
end $$;
reset role;

-- ============ CC12 : search_path verrouillé sur les deux fonctions ============
do $$ begin
  perform 1 from pg_proc p
   where p.proname in ('create_invitation', 'accept_invitation')
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '12 ECHEC: une fonction invitation n a pas search_path=public'; end if;
  raise notice 'OK 12: search_path=public verrouille sur create/accept_invitation';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
