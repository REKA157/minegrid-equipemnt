-- CONTRE-CAS : payment_records re-verrouillée (P11). Après prereq + migration.
-- A=..a1 (vendeur/payee), B=..b1 (acheteur/payer, participant), paiement PR=..000e.

-- CONTRE-CAS 1 (LE P0) : le vendeur A ne peut PLUS forger un « fonds libérés ».
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.payment_records (transaction_case_id, payer_id, payee_id, amount, status)
    values ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1',
            '00000000-0000-0000-0000-0000000000a1', 100000, 'released');
    raise exception 'CC1 ECHEC: A a pu inserer un paiement (write non revoque)';
  exception when insufficient_privilege then
    raise notice 'OK CC1: A ne peut plus inserer de paiement';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC1: insertion paiement refusee (%)', sqlerrm;
  end;
end $$;
reset role;

-- CONTRE-CAS 2 (LE P0) : A ne peut PLUS passer un paiement existant à 'released'.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  begin
    update public.payment_records set status = 'released' where id = '0e000000-0000-0000-0000-00000000000e';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CC2 FUITE: A a modifie % paiement(s)', n; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK CC2: A ne peut plus marquer un paiement "released"';
end $$;
reset role;
do $$ declare v text; begin
  select status into v from public.payment_records where id = '0e000000-0000-0000-0000-00000000000e';
  if v <> 'pending' then raise exception 'CC2 FUITE: le statut du paiement a change (v=%)', v; end if;
end $$;

-- POSITIF 3 : la LECTURE reste possible pour une partie du dossier.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from public.payment_records where id = '0e000000-0000-0000-0000-00000000000e';
  if n <> 1 then raise exception 'CC3 ECHEC: une partie devrait lire le paiement (n=%)', n; end if;
  raise notice 'OK CC3: une partie du dossier lit le paiement';
end $$;
reset role;

-- CONTRE-CAS 4 : aucun privilège d'écriture ne subsiste (client/anon).
do $$ begin
  if has_table_privilege('anon', 'public.payment_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.payment_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.payment_records', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payment_records', 'DELETE') then
    raise exception 'CC4 FUITE: un privilege d''ecriture subsiste sur payment_records';
  end if;
  raise notice 'OK CC4: aucun privilege d''ecriture client sur payment_records';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
