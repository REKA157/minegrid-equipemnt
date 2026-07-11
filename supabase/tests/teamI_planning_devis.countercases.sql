-- =====================================================================
-- CONTRE-CAS : RLS planning_events + devis (privés par utilisateur).
-- Charger APRÈS prereq + migration teamI.
-- userA = …00a1 (propriétaire) ; userB = …00b1 (ne doit RIEN voir/toucher).
-- Le point clé : B ne peut PAS modifier/supprimer par id SEUL (la faille d'origine).
-- =====================================================================

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');

-- =====================================================================
-- planning_events
-- =====================================================================

-- POSITIF 1 : A crée son événement (id fixe) et le voit.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  insert into public.planning_events (id, user_id, title)
  values ('e1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'RDV A');
  select count(*) into n from public.planning_events where id = 'e1000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'PE1 ECHEC: A ne voit pas son propre evenement (n=%)', n; end if;
  raise notice 'OK PE1: A cree et voit son evenement';
end $$;
reset role;

-- CONTRE-CAS 2 : A ne peut PAS insérer un événement au nom de B (with check).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.planning_events (user_id, title)
    values ('00000000-0000-0000-0000-0000000000b1', 'usurpation');
    raise exception 'PE2 ECHEC: A a pu inserer un evenement au nom de B';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK PE2: insert au nom d''autrui refuse (with check)';
  end;
end $$;
reset role;

-- CONTRE-CAS 3 : B ne voit AUCUN événement de A.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.planning_events;
  if n <> 0 then raise exception 'PE3 FUITE: B voit % evenement(s) de A', n; end if;
  raise notice 'OK PE3: B ne voit aucun evenement de A';
end $$;
reset role;

-- CONTRE-CAS 4 (LA FAILLE) : B ne peut PAS modifier l'événement de A par id seul.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  update public.planning_events set title = 'PIRATE' where id = 'e1000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PE4 FUITE: B a modifie % evenement(s) de A par id', n; end if;
  raise notice 'OK PE4: B ne peut pas modifier l''evenement de A par id';
end $$;
reset role;
do $$ declare v_title text; begin
  select title into v_title from public.planning_events where id = 'e1000000-0000-0000-0000-0000000000a1';
  if v_title = 'PIRATE' then raise exception 'PE4 FUITE: l''evenement de A a ete altere'; end if;
end $$;

-- CONTRE-CAS 5 (LA FAILLE) : B ne peut PAS supprimer l'événement de A par id seul.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  delete from public.planning_events where id = 'e1000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PE5 FUITE: B a supprime % evenement(s) de A par id', n; end if;
  raise notice 'OK PE5: B ne peut pas supprimer l''evenement de A par id';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.planning_events where id = 'e1000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'PE5 FUITE: l''evenement de A a disparu'; end if;
end $$;

-- CONTRE-CAS 6 : anon n'a AUCUN privilège sur planning_events.
do $$ begin
  if has_table_privilege('anon', 'public.planning_events', 'SELECT') then
    raise exception 'PE6 FUITE: anon a le privilege SELECT sur planning_events';
  end if;
  raise notice 'OK PE6: anon sans privilege sur planning_events';
end $$;

-- =====================================================================
-- devis (mêmes garanties)
-- =====================================================================

-- POSITIF 1 : A crée son devis et le voit.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  insert into public.devis (id, user_id, notes, total)
  values ('d1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Devis A', 1000);
  select count(*) into n from public.devis where id = 'd1000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'DV1 ECHEC: A ne voit pas son propre devis (n=%)', n; end if;
  raise notice 'OK DV1: A cree et voit son devis';
end $$;
reset role;

-- CONTRE-CAS 2 : A ne peut PAS créer un devis au nom de B.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.devis (user_id, notes, total)
    values ('00000000-0000-0000-0000-0000000000b1', 'usurpation', 1);
    raise exception 'DV2 ECHEC: A a pu inserer un devis au nom de B';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK DV2: insert de devis au nom d''autrui refuse (with check)';
  end;
end $$;
reset role;

-- CONTRE-CAS 3 : B ne voit AUCUN devis de A.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.devis;
  if n <> 0 then raise exception 'DV3 FUITE: B voit % devis de A', n; end if;
  raise notice 'OK DV3: B ne voit aucun devis de A';
end $$;
reset role;

-- CONTRE-CAS 4 (LA FAILLE) : B ne peut PAS modifier le devis de A par id seul.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  update public.devis set notes = 'PIRATE' where id = 'd1000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DV4 FUITE: B a modifie % devis de A par id', n; end if;
  raise notice 'OK DV4: B ne peut pas modifier le devis de A par id';
end $$;
reset role;
do $$ declare v_notes text; begin
  select notes into v_notes from public.devis where id = 'd1000000-0000-0000-0000-0000000000a1';
  if v_notes = 'PIRATE' then raise exception 'DV4 FUITE: le devis de A a ete altere'; end if;
end $$;

-- CONTRE-CAS 5 (LA FAILLE) : B ne peut PAS supprimer le devis de A par id seul.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  delete from public.devis where id = 'd1000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DV5 FUITE: B a supprime % devis de A par id', n; end if;
  raise notice 'OK DV5: B ne peut pas supprimer le devis de A par id';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.devis where id = 'd1000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'DV5 FUITE: le devis de A a disparu'; end if;
end $$;

-- CONTRE-CAS 6 : anon n'a AUCUN privilège sur devis.
do $$ begin
  if has_table_privilege('anon', 'public.devis', 'SELECT') then
    raise exception 'DV6 FUITE: anon a le privilege SELECT sur devis';
  end if;
  raise notice 'OK DV6: anon sans privilege sur devis';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
