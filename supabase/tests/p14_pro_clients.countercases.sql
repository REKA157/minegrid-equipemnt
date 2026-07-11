-- CONTRE-CAS : pro_clients verrouillée (P14). Après prereq + migration.
-- A=..a1 (compte gratuit), B=..b1 (enterprise). AVANT : A pouvait s'auto-activer.

-- CONTRE-CAS 1 (LA FAILLE REVENUS) : A ne peut PLUS passer son abonnement à 'active'.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.pro_clients set subscription_status = 'active', subscription_type = 'enterprise'
      where user_id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'CC1 ECHEC: A a pu s''auto-octroyer un abonnement (write non revoque)';
  exception when insufficient_privilege then
    raise notice 'OK CC1: A ne peut plus s''auto-activer un abonnement';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC1: auto-activation refusee (%)', sqlerrm;
  end;
end $$;
reset role;
do $$ declare v text; begin
  select subscription_status into v from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000a1';
  if v <> 'free' then raise exception 'CC1 FUITE: abonnement de A altere (status=%)', v; end if;
end $$;

-- CONTRE-CAS 2 : A ne peut PLUS insérer une nouvelle ligne d'abonnement.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.pro_clients (user_id, subscription_type, subscription_status)
    values ('00000000-0000-0000-0000-0000000000a1', 'premium', 'active');
    raise exception 'CC2 ECHEC: A a pu inserer un abonnement';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC2: insertion d''abonnement client refusee';
  end;
end $$;
reset role;

-- POSITIF 3 : A garde la LECTURE de son propre abonnement.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'CC3 ECHEC: A ne voit pas son propre abonnement (n=%)', n; end if;
  raise notice 'OK CC3: A lit son propre abonnement';
end $$;
reset role;

-- CONTRE-CAS 4 : A ne voit pas l'abonnement de B (isolation).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'CC4 FUITE: A voit l''abonnement de B'; end if;
  raise notice 'OK CC4: A ne voit pas l''abonnement d''un autre';
end $$;
reset role;

-- CONTRE-CAS 5 : aucun privilège d'écriture client ne subsiste.
do $$ begin
  if has_table_privilege('authenticated', 'public.pro_clients', 'INSERT')
     or has_table_privilege('authenticated', 'public.pro_clients', 'UPDATE')
     or has_table_privilege('anon', 'public.pro_clients', 'INSERT') then
    raise exception 'CC5 FUITE: un privilege d''ecriture subsiste sur pro_clients';
  end if;
  raise notice 'OK CC5: aucun privilege d''ecriture client sur pro_clients (service_role only)';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
