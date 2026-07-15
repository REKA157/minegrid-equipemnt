-- Contre-cas P21 (B) — `offers` absente : la fonction existe (sinon le prereq+migration
-- auraient échoué) et l'appel renvoie views=3, contacts=2 (offers -> 0, messages=2).
do $$
declare v bigint; c bigint;
begin
  -- La fonction doit exister malgré l'absence de public.offers
  if to_regprocedure('public.machine_engagement_counts(uuid[])') is null then
    raise exception '(B) ECHEC: la RPC n a pas ete creee alors que offers est absente';
  end if;

  set local role authenticated;
  set local test.uid = '11111111-1111-1111-1111-111111111111';
  select views, contacts into v, c
  from public.machine_engagement_counts(array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid])
  where machine_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  if v <> 3 then raise exception '(B) views attendu 3, obtenu %', v; end if;
  if c <> 2 then raise exception '(B) contacts attendu 2 (offers absente -> 0, messages=2), obtenu %', c; end if;
  raise notice '(B) OK offers absente : views=3 contacts=2, aucune erreur de creation';
end $$;
