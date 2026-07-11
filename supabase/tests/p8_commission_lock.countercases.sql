-- =====================================================================
-- CONTRE-CAS : commission_records verrouillée (P8). Charger APRÈS prereq + migration.
-- AVANT correctif (état du prereq) : B (participant) pouvait INSERT/UPDATE une
-- commission. APRÈS : plus aucune écriture cliente ; lecture (bénéf/parties) OK.
-- A=..a1 (vendeur), B=..b1 (participant), Bk=..bbbb (bénéficiaire), X=..x1 (tiers).
-- =====================================================================

-- CONTRE-CAS 1 (LE P0) : B (participant, can_access=true) ne peut PLUS INSÉRER une commission.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  begin
    insert into public.commission_records (transaction_case_id, beneficiary_id, amount, status)
    values ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1', 999, 'paid');
    raise exception 'CC1 ECHEC: B a pu forger une commission (write non revoque)';
  exception when insufficient_privilege then
    raise notice 'OK CC1: B ne peut plus inserer de commission (write revoque)';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC1: insert commission refuse (%)', sqlerrm;
  end;
end $$;
reset role;

-- CONTRE-CAS 2 (LE P0) : B ne peut PLUS passer une commission existante à 'paid' / changer amount.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  begin
    update public.commission_records set status = 'paid', amount = 999
      where id = '0d000000-0000-0000-0000-00000000000d';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CC2 FUITE: B a modifie % commission(s)', n; end if;
  exception when insufficient_privilege then
    null; -- revoke UPDATE -> refus direct, egalement correct
  end;
  raise notice 'OK CC2: B ne peut plus modifier une commission';
end $$;
reset role;
do $$ declare r record; begin
  select status, amount into r from public.commission_records where id = '0d000000-0000-0000-0000-00000000000d';
  if r.status <> 'pending' or r.amount <> 100 then
    raise exception 'CC2 FUITE: la commission a ete alteree (status=%, amount=%)', r.status, r.amount;
  end if;
end $$;

-- CONTRE-CAS 3 : même le BÉNÉFICIAIRE ne peut plus écrire (écriture 100% serveur).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000bbbb';
do $$ declare n int; begin
  begin
    update public.commission_records set status = 'paid'
      where id = '0d000000-0000-0000-0000-00000000000d';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CC3 FUITE: le beneficiaire a modifie % commission(s)', n; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK CC3: le beneficiaire ne peut pas s''auto-marquer paye';
end $$;
reset role;

-- POSITIF 4 : la LECTURE reste possible (bénéficiaire + partie du dossier).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000bbbb';
do $$ declare n int; begin
  select count(*) into n from public.commission_records where id = '0d000000-0000-0000-0000-00000000000d';
  if n <> 1 then raise exception 'CC4 ECHEC: le beneficiaire ne voit pas sa commission (n=%)', n; end if;
  raise notice 'OK CC4: le beneficiaire lit sa commission';
end $$;
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.commission_records;
  if n <> 1 then raise exception 'CC4b ECHEC: une partie du dossier devrait voir la commission (n=%)', n; end if;
  raise notice 'OK CC4b: une partie du dossier lit la commission';
end $$;
reset role;

-- CONTRE-CAS 5 : un TIERS (non participant, non bénéficiaire) ne voit AUCUNE commission.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f1';
do $$ declare n int; begin
  select count(*) into n from public.commission_records;
  if n <> 0 then raise exception 'CC5 FUITE: un tiers voit % commission(s)', n; end if;
  raise notice 'OK CC5: un tiers ne voit aucune commission';
end $$;
reset role;

-- CONTRE-CAS 6 : anon n'a AUCUN privilège d'écriture sur commission_records.
do $$ begin
  if has_table_privilege('anon', 'public.commission_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.commission_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.commission_records', 'UPDATE') then
    raise exception 'CC6 FUITE: un privilege d''ecriture subsiste sur commission_records';
  end if;
  raise notice 'OK CC6: aucun privilege d''ecriture client sur commission_records';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
