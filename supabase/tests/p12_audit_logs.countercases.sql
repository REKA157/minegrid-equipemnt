-- CONTRE-CAS : audit_logs auto-attribution (P12). Après prereq + migration. A=..a1, B=..b1.

-- POSITIF 1 : A insère une entrée À SON nom -> OK.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  insert into public.audit_logs (actor_id, action) values ('00000000-0000-0000-0000-0000000000a1', 'login');
  select count(*) into n from public.audit_logs where actor_id = '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'CC1 ECHEC: A ne peut pas logger a son nom (n=%)', n; end if;
  raise notice 'OK CC1: A logue a son propre nom';
end $$;
reset role;

-- CONTRE-CAS 2 (LA POLLUTION) : A ne peut PLUS insérer une entrée ANONYME (actor_id NULL).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.audit_logs (actor_id, action) values (null, 'anonyme');
    raise exception 'CC2 ECHEC: A a insere une entree anonyme (pollution)';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC2: entree anonyme (actor_id NULL) refusee';
  end;
end $$;
reset role;

-- CONTRE-CAS 3 : A ne peut PLUS insérer une entrée au nom d'un AUTRE.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.audit_logs (actor_id, action) values ('00000000-0000-0000-0000-0000000000b1', 'usurpation');
    raise exception 'CC3 ECHEC: A a insere une entree au nom de B';
  exception when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC3: entree au nom d''autrui refusee';
  end;
end $$;
reset role;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
