-- =====================================================================
-- CONTRE-CAS « base migrée depuis l'ancien schéma » (à charger APRÈS
-- prereq + legacy_seed + migration 20260708140000). Rejoue les attaques que
-- l'audit a identifiées et prouve qu'elles sont bloquées après durcissement.
--
-- org A = 0a…0001 / org B = 0b…0002
-- a1 …00a1 owner A / b1 …00b1 owner B
-- f1 …00f1 attaquant : « admin » client_users MAIS membre d'aucune org (seedé)
-- =====================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@a.ma'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@b.ma');

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- ===== CC-L1 (CRITIQUE) : l'INSERT direct forgé est refusé malgré les policies
-- héritées + le statut client_users admin (grant révoqué + policies supprimées).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f1';   -- attaquant
do $$ begin
  begin
    insert into public.user_invitations (email, role, status, organization_id)
    values ('attacker@evil.ma', 'admin', 'pending', '0b000000-0000-0000-0000-000000000002');
    raise exception 'L1 ECHEC: INSERT direct forge autorise (injection inter-societe possible)';
  exception when insufficient_privilege then
    raise notice 'OK L1: INSERT direct refuse malgre policies heritees + client_users admin';
  end;
end $$;
reset role;

-- ===== CC-L3 : create_invitation FONCTIONNE sur la table migrée (colonne name
-- auto-ajoutée -> pas d'erreur 42703).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';   -- owner A
do $$ declare r record; begin
  select * into r from public.create_invitation('recruit@x.ma', 'Recrue', 'viewer');
  if r.token is null then
    raise exception 'L3 ECHEC: create_invitation echoue sur table migree (colonne name manquante ?)';
  end if;
  insert into public._teststate(k, v) values ('inv', r.id::text)
    on conflict (k) do update set v = excluded.v;
  raise notice 'OK L3: create_invitation fonctionne sur table migree (colonne name auto-ajoutee)';
end $$;
-- L'admin de A voit bien son invitation (lecture scopée).
do $$ declare n int; begin
  select count(*) into n from public.user_invitations where email = 'recruit@x.ma';
  if n <> 1 then raise exception 'L3b ECHEC: a1 ne voit pas son invitation (n=%)', n; end if;
  raise notice 'OK L3b: admin de A voit son invitation';
end $$;
reset role;
-- La colonne name est bien présente ET écrite.
do $$ declare nm text; begin
  select name into nm from public.user_invitations where email = 'recruit@x.ma';
  if nm is distinct from 'Recrue' then raise exception 'L3c ECHEC: colonne name absente/non ecrite (%)', nm; end if;
  raise notice 'OK L3c: colonne name presente et renseignee';
end $$;

-- ===== CC-L2 : l'attaquant (client_users admin, hors org) ne LIT aucune
-- invitation (policies héritées supprimées).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f1';
do $$ declare n int; begin
  select count(*) into n from public.user_invitations;
  if n <> 0 then
    raise exception 'L2 FUITE: attaquant lit % invitation(s) (policies heritees survivantes ?)', n;
  end if;
  raise notice 'OK L2: attaquant hors org ne lit AUCUNE invitation (fuite inter-societe fermee)';
end $$;

-- ===== CC-L4 : l'attaquant ne peut pas non plus créer via la RPC (hors org).
do $$ begin
  begin
    perform public.create_invitation('victim@x.ma', 'V', 'admin');
    raise exception 'L4 ECHEC: attaquant a pu creer une invitation via la RPC';
  exception when sqlstate '42501' then
    raise notice 'OK L4: attaquant hors org ne peut pas creer d invitation (RPC)';
  end;
end $$;

-- ===== CC-L5 : l'annulation est scopée à la société.
do $$ declare inv uuid; begin
  select v::uuid into inv from public._teststate where k = 'inv';
  begin
    perform public.cancel_invitation(inv);
    raise exception 'L5 ECHEC: attaquant a pu annuler une invitation de la societe A';
  exception when sqlstate '42501' then
    raise notice 'OK L5: attaquant ne peut pas annuler l invitation d une autre societe';
  end;
end $$;
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare inv uuid; ok boolean; begin
  select v::uuid into inv from public._teststate where k = 'inv';
  select public.cancel_invitation(inv) into ok;
  if not ok then raise exception 'L5b ECHEC: a1 ne peut pas annuler sa propre invitation'; end if;
  raise notice 'OK L5b: admin de A annule sa propre invitation';
end $$;
reset role;
do $$ declare st text; begin
  select status into st from public.user_invitations where email = 'recruit@x.ma';
  if st <> 'cancelled' then raise exception 'L5c ECHEC: invitation pas annulee (%)', st; end if;
  raise notice 'OK L5c: invitation marquee cancelled';
end $$;

-- ===== CC-L6 : search_path verrouillé sur cancel_invitation.
do $$ begin
  perform 1 from pg_proc p
   where p.proname = 'cancel_invitation'
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception 'L6 ECHEC: cancel_invitation sans search_path=public'; end if;
  raise notice 'OK L6: search_path=public verrouille sur cancel_invitation';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS LEGACY PASSES ====='; end $$;
