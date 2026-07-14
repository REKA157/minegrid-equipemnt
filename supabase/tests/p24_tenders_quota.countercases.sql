-- =====================================================================
-- Contre-cas P24 — quota tenders-ai par utilisateur.
-- =====================================================================

-- (1) Plafond 3/jour : les 3 premiers appels renvoient true, ensuite false
do $$
declare r1 bool; r2 bool; r3 bool; r4 bool; r5 bool;
begin
  set role service_role;
  r1 := (select public.bump_tenders_usage('11111111-1111-1111-1111-111111111111'::uuid, 3));
  r2 := (select public.bump_tenders_usage('11111111-1111-1111-1111-111111111111'::uuid, 3));
  r3 := (select public.bump_tenders_usage('11111111-1111-1111-1111-111111111111'::uuid, 3));
  r4 := (select public.bump_tenders_usage('11111111-1111-1111-1111-111111111111'::uuid, 3));
  r5 := (select public.bump_tenders_usage('11111111-1111-1111-1111-111111111111'::uuid, 3));
  reset role;
  if not (r1 and r2 and r3) then raise exception '(1) ECHEC: 3 premiers doivent etre true (%, %, %)', r1, r2, r3; end if;
  if r4 or r5 then raise exception '(1) ECHEC: au-dela du plafond doit etre false (%, %)', r4, r5; end if;
  raise notice '(1) OK plafond 3/jour respecte';
end $$;

-- (2) Indépendance par utilisateur : un autre uid repart à zéro
do $$
declare r bool; n int;
begin
  set role service_role;
  r := (select public.bump_tenders_usage('22222222-2222-2222-2222-222222222222'::uuid, 3));
  reset role;
  if not r then raise exception '(2) ECHEC: 1er appel d un autre uid doit etre true'; end if;
  n := (select request_count from public.tenders_ai_usage_daily
        where user_id = '11111111-1111-1111-1111-111111111111'::uuid and usage_date = current_date);
  if n <> 5 then raise exception '(2) ECHEC: compteur uid1 attendu 5, obtenu %', n; end if;
  raise notice '(2) OK compteurs independants';
end $$;

-- (3) Le client (authenticated) ne peut PAS exécuter la RPC (réservée service_role)
do $$
begin
  set role authenticated;
  begin
    perform public.bump_tenders_usage('11111111-1111-1111-1111-111111111111'::uuid, 3);
    reset role;
    raise exception '(3) ECHEC: authenticated ne devrait PAS pouvoir executer la RPC';
  exception
    when insufficient_privilege then
      raise notice '(3) OK execute refuse au client';
    when others then
      raise;
  end;
  reset role;
end $$;
