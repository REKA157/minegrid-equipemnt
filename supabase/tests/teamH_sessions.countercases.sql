-- =====================================================================
-- CONTRE-CAS : historique des sessions (member_sessions). Charger APRÈS
-- prereq + migration teamH.
--
-- Sociétés : A = 0a..0001, B = 0b..0002.
-- Membres  : A_owner  = ..00a1 (owner A), A_viewer = ..00a2 (viewer A),
--            B_owner  = ..00b1 (owner B).
-- Règle prouvée : un membre voit/ferme SES sessions ; un admin/owner voit
-- celles de TOUTE SA société ; JAMAIS celles d'une autre société.
-- =====================================================================

-- ------------------------- SEED (superuser) -------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a.owner@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'a.viewer@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b.owner@b.test');

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Societe A'),
  ('0b000000-0000-0000-0000-000000000002', 'Societe B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'viewer'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- ============ POSITIF 1 : A_viewer se connecte ; org forcée côté serveur ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare v_id uuid; begin
  v_id := public.record_session_login('UA-viewer-1');
  if v_id is null then raise exception '1 ECHEC: la connexion de A_viewer a renvoye null'; end if;
  perform set_config('test.sid_av', v_id::text, false);
end $$;
reset role;
do $$ declare r record; begin
  select organization_id, user_id, logout_at into r
  from public.member_sessions where id = current_setting('test.sid_av')::uuid;
  if r.user_id <> '00000000-0000-0000-0000-0000000000a2' then
    raise exception '1 ECHEC: user_id force incorrect (%)', r.user_id; end if;
  if r.organization_id <> '0a000000-0000-0000-0000-000000000001' then
    raise exception '1 ECHEC: organization_id force incorrect (%)', r.organization_id; end if;
  if r.logout_at is not null then raise exception '1 ECHEC: session ouverte attendue'; end if;
  raise notice 'OK 1: connexion A_viewer -> org A forcee, session ouverte';
end $$;

-- ============ POSITIF 2 : 2e SIGNED_IN rapproché = MÊME session (anti-doublon) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare v_id2 uuid; begin
  v_id2 := public.record_session_login('UA-viewer-2');
  if v_id2::text <> current_setting('test.sid_av') then
    raise exception '2 ECHEC: 2e connexion rapprochee devrait renvoyer la meme session (% vs %)',
      v_id2, current_setting('test.sid_av');
  end if;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.member_sessions
   where user_id = '00000000-0000-0000-0000-0000000000a2';
  if n <> 1 then raise exception '2 ECHEC: anti-doublon casse, % ligne(s) pour A_viewer (attendu 1)', n; end if;
  raise notice 'OK 2: anti-doublon (2 connexions rapprochees = 1 seule session)';
end $$;

-- ============ POSITIF 3 : A_viewer ferme SA session ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  perform public.record_session_logout(current_setting('test.sid_av')::uuid);
end $$;
reset role;
do $$ declare v_out timestamptz; begin
  select logout_at into v_out from public.member_sessions where id = current_setting('test.sid_av')::uuid;
  if v_out is null then raise exception '3 ECHEC: la deconnexion de A_viewer n''a pas ete enregistree'; end if;
  raise notice 'OK 3: A_viewer ferme sa propre session (logout enregistre)';
end $$;

-- ============ SETUP : A_owner ouvre une session (pour les cas suivants) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v_id uuid; begin
  v_id := public.record_session_login('UA-owner-1');
  if v_id is null then raise exception 'SETUP ECHEC: la connexion de A_owner a renvoye null'; end if;
  perform set_config('test.sid_ao', v_id::text, false);
end $$;
reset role;

-- ============ CONTRE-CAS 4 (CRITIQUE) : A_viewer ne peut PAS fermer la session de A_owner ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  perform public.record_session_logout(current_setting('test.sid_ao')::uuid); -- id connu, pas la sienne
end $$;
reset role;
do $$ declare v_out timestamptz; begin
  select logout_at into v_out from public.member_sessions where id = current_setting('test.sid_ao')::uuid;
  if v_out is not null then raise exception '4 FUITE: A_viewer a ferme la session de A_owner'; end if;
  raise notice 'OK 4: A_viewer ne peut pas fermer la session d''un autre membre';
end $$;

-- ============ POSITIF 5 : A_owner (admin) voit les sessions de TOUTE sa societe ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.member_sessions;
  if n < 2 then raise exception '5 ECHEC: admin devrait voir >=2 sessions de son org (n=%)', n; end if;
  raise notice 'OK 5: admin A voit les sessions de son org (n=%)', n;
end $$;
reset role;

-- ============ CONTRE-CAS 6 (CRITIQUE) : B_owner ne voit AUCUNE session de la societe A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.member_sessions;
  if n <> 0 then raise exception '6 FUITE: B voit % session(s) d''une autre societe', n; end if;
  raise notice 'OK 6: B ne voit AUCUNE session de la societe A (isolation)';
end $$;
reset role;

-- ============ CONTRE-CAS 7 : un viewer ne voit QUE ses propres sessions ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare n int; begin
  select count(*) into n from public.member_sessions
   where user_id <> '00000000-0000-0000-0000-0000000000a2';
  if n <> 0 then raise exception '7 FUITE: un viewer voit % session(s) d''un autre membre', n; end if;
  select count(*) into n from public.member_sessions;
  if n < 1 then raise exception '7 ECHEC: le viewer devrait voir ses propres sessions (n=%)', n; end if;
  raise notice 'OK 7: un viewer ne voit QUE ses propres sessions';
end $$;
reset role;

-- ============ POSITIF 8 : get_member_sessions — admin obtient l'historique d'un membre ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.get_member_sessions('00000000-0000-0000-0000-0000000000a2'::uuid, 50);
  if n < 1 then raise exception '8 ECHEC: admin devrait obtenir l''historique de A_viewer (n=%)', n; end if;
  raise notice 'OK 8: admin obtient l''historique d''un membre (n=%)', n;
end $$;
reset role;

-- ============ CONTRE-CAS 9 (CRITIQUE) : B_owner ne lit PAS l'historique d'un membre de A ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.get_member_sessions('00000000-0000-0000-0000-0000000000a2'::uuid, 50);
  if n <> 0 then raise exception '9 FUITE: B obtient % session(s) d''un membre d''une autre societe', n; end if;
  raise notice 'OK 9: B ne lit pas l''historique d''un membre d''une autre societe';
end $$;
reset role;

-- ============ CONTRE-CAS 10 : un viewer ne lit PAS l'historique d'un autre membre ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare n int; begin
  select count(*) into n from public.get_member_sessions('00000000-0000-0000-0000-0000000000a1'::uuid, 50);
  if n <> 0 then raise exception '10 FUITE: un viewer obtient % session(s) d''un autre membre', n; end if;
  raise notice 'OK 10: un viewer ne lit pas l''historique d''un autre membre';
end $$;
reset role;

-- ============ POSITIF 11 : stats « connectes aujourd'hui » (admin) ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  n := public.get_org_session_stats();
  if n < 2 then raise exception '11 ECHEC: stats admin devrait compter >=2 connectes aujourd''hui (n=%)', n; end if;
  raise notice 'OK 11: stats connectes aujourd''hui (admin, n=%)', n;
end $$;
reset role;

-- ============ CONTRE-CAS 12 : stats d'une autre societe = 0 ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  n := public.get_org_session_stats();
  if n <> 0 then raise exception '12 FUITE: stats de B compte % connectes (societe A)', n; end if;
  raise notice 'OK 12: stats de B = 0 (isolation)';
end $$;
reset role;

-- ============ CONTRE-CAS 13 : search_path verrouille sur les 4 fonctions ============
do $$ begin
  perform 1 from pg_proc p
   where p.proname in ('record_session_login','record_session_logout','get_member_sessions','get_org_session_stats')
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '13 ECHEC: search_path=public non verrouille sur une fonction session'; end if;
  raise notice 'OK 13: search_path=public verrouille sur les 4 fonctions session';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
