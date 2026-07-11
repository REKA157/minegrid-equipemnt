-- CONTRE-CAS : transaction_cases UPDATE restreint (migration 20260702090400).
-- Après prereq + migration. A=..a1 (vendeur), B=..b1 (acheteur), T=..c1 (transporteur/participant).

-- POSITIF 1 : le vendeur A modifie une colonne SÛRE (title) -> OK.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v text; begin
  update public.transaction_cases set title = 'Renommé' where id = '0c000000-0000-0000-0000-00000000000c';
  select title into v from public.transaction_cases where id = '0c000000-0000-0000-0000-00000000000c';
  if v <> 'Renommé' then raise exception 'CC1 ECHEC: A ne peut pas modifier title (v=%)', v; end if;
  raise notice 'OK CC1: A modifie une colonne sure (title)';
end $$;
reset role;

-- CONTRE-CAS 2 (LE COEUR) : A ne peut PLUS changer total_amount (colonne sensible).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.transaction_cases set total_amount = 1 where id = '0c000000-0000-0000-0000-00000000000c';
    raise exception 'CC2 ECHEC: A a pu changer total_amount';
  exception when insufficient_privilege then
    raise notice 'OK CC2: A ne peut plus changer total_amount (colonne verrouillee)';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC2: changement total_amount refuse (%)', sqlerrm;
  end;
end $$;
reset role;
do $$ declare v numeric; begin
  select total_amount into v from public.transaction_cases where id = '0c000000-0000-0000-0000-00000000000c';
  if v <> 100000 then raise exception 'CC2 FUITE: total_amount altere (v=%)', v; end if;
end $$;

-- CONTRE-CAS 3 : A ne peut PLUS changer status (colonne sensible).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.transaction_cases set status = 'closed' where id = '0c000000-0000-0000-0000-00000000000c';
    raise exception 'CC3 ECHEC: A a pu changer status';
  exception when insufficient_privilege then
    raise notice 'OK CC3: A ne peut plus changer status (colonne verrouillee)';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC3: changement status refuse (%)', sqlerrm;
  end;
end $$;
reset role;

-- CONTRE-CAS 4 : le transporteur T (participant NON principal) ne peut RIEN modifier (policy principals).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ declare n int; begin
  update public.transaction_cases set title = 'T-hack' where id = '0c000000-0000-0000-0000-00000000000c';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CC4 FUITE: le transporteur a modifie % dossier(s)', n; end if;
  raise notice 'OK CC4: un participant non principal ne peut pas modifier le dossier';
end $$;
reset role;

-- POSITIF 5 : l'acheteur B (principal) modifie une colonne sûre (notes) -> OK.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare v text; begin
  update public.transaction_cases set notes = 'ok' where id = '0c000000-0000-0000-0000-00000000000c';
  select notes into v from public.transaction_cases where id = '0c000000-0000-0000-0000-00000000000c';
  if v <> 'ok' then raise exception 'CC5 ECHEC: B ne peut pas modifier notes (v=%)', v; end if;
  raise notice 'OK CC5: un principal modifie une colonne sure (notes)';
end $$;
reset role;

-- CONTRE-CAS 6 : plus aucun privilège UPDATE sur les colonnes sensibles.
do $$ begin
  if has_table_privilege('authenticated', 'public.transaction_cases', 'UPDATE') then
    raise exception 'CC6 FUITE: UPDATE table-level subsiste (colonnes sensibles ouvertes)';
  end if;
  raise notice 'OK CC6: pas d''UPDATE table-level (seules title/notes/priority en colonne)';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
