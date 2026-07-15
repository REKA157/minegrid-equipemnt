-- Contre-cas P21 (A) — comptes corrects + SCOPING par vendeur (auth.uid()).

-- U1 : views(M1)=3 ; contacts = offers(U1=2) + messages(U1=2) = 4 ; M2 = 0/0
do $$
declare v bigint; c bigint;
begin
  set local role authenticated;
  set local test.uid = '11111111-1111-1111-1111-111111111111';
  select views, contacts into v, c
  from public.machine_engagement_counts(array[
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  ]) where machine_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  if v <> 3 then raise exception '(A) U1 views attendu 3, obtenu %', v; end if;
  if c <> 4 then raise exception '(A) U1 contacts attendu 4 (offers2+msg2), obtenu %', c; end if;

  select views, contacts into v, c
  from public.machine_engagement_counts(array[
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  ]) where machine_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  if coalesce(v,0) <> 0 or coalesce(c,0) <> 0 then raise exception '(A) M2 attendu 0/0, obtenu %/%', v, c; end if;
  raise notice '(A) OK U1 M1 views=3 contacts=4, M2=0/0';
end $$;

-- CONTRE-CAS scoping : U2 ne voit QUE son offre (1), jamais celle de U1 -> contacts=1
do $$
declare c bigint;
begin
  set local role authenticated;
  set local test.uid = '22222222-2222-2222-2222-222222222222';
  select contacts into c
  from public.machine_engagement_counts(array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid])
  where machine_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  if c <> 1 then raise exception '(A) CONTRE-CAS U2 contacts attendu 1 (sa seule offre), obtenu %', c; end if;
  raise notice '(A) OK scoping U2 contacts=1';
end $$;
