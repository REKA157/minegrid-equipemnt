-- CONTRE-CAS : codes promo sécurisés (P15). Après prereq + migration.
-- A=..a1, B=..b1, C=..c1. Codes semés en superuser.

-- Semis (superuser) : GOLD (enterprise, 2 usages), OLD (expiré), OFF (inactif).
insert into public.promo_codes (id, code, subscription_type, duration_days, max_uses, expires_at, active) values
  ('0a000000-0000-0000-0000-0000000000d1', 'GOLD2026', 'enterprise', 30, 2, now() + interval '30 days', true),
  ('0a000000-0000-0000-0000-0000000000d2', 'OLD2020',  'enterprise', 30, 5, now() - interval '1 day',  true),
  ('0a000000-0000-0000-0000-0000000000d3', 'OFF',      'enterprise', 30, 5, null, false);

-- POSITIF 1 : A utilise GOLD -> activé enterprise (RPC écrit pro_clients malgré le verrou).
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r jsonb; begin
  r := public.redeem_promo_code('gold2026');  -- casse insensible
  if (r->>'ok') <> 'true' then raise exception 'CC1 ECHEC: rédemption A refusée (%)', r; end if;
  raise notice 'OK CC1: A active son abonnement via code (%). ', r->>'subscription_type';
end $$;
reset role;
do $$ declare v text; declare n int; begin
  select subscription_status into v from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000a1';
  if v <> 'active' then raise exception 'CC1 ECHEC: pro_clients de A pas active (%)', v; end if;
  select uses_count into n from public.promo_codes where id = '0a000000-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'CC1 ECHEC: uses_count devrait être 1 (%)', n; end if;
  raise notice 'OK CC1b: pro_clients A=active, uses_count=1';
end $$;

-- CONTRE-CAS 2 : A ré-utilise GOLD -> refusé (un usage par compte), uses_count inchangé.
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r jsonb; begin
  r := public.redeem_promo_code('GOLD2026');
  if (r->>'ok') <> 'false' then raise exception 'CC2 ECHEC: A a pu ré-utiliser le code'; end if;
  raise notice 'OK CC2: seconde utilisation par A refusée (%)', r->>'error';
end $$;
reset role;
do $$ declare n int; begin
  select uses_count into n from public.promo_codes where id = '0a000000-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'CC2 FUITE: uses_count incrémenté sur un refus (%)', n; end if;
end $$;

-- POSITIF 3 : B utilise GOLD -> ok (2e usage), uses_count=2.
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare r jsonb; begin
  r := public.redeem_promo_code('GOLD2026');
  if (r->>'ok') <> 'true' then raise exception 'CC3 ECHEC: B refusé (%)', r; end if;
  raise notice 'OK CC3: B active (2e usage)';
end $$;
reset role;

-- CONTRE-CAS 4 : C utilise GOLD -> refusé (quota épuisé max_uses=2).
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ declare r jsonb; begin
  r := public.redeem_promo_code('GOLD2026');
  if (r->>'ok') <> 'false' then raise exception 'CC4 ECHEC: C a pu utiliser un code épuisé'; end if;
  raise notice 'OK CC4: quota épuisé -> C refusé (%)', r->>'error';
end $$;
reset role;

-- CONTRE-CAS 5/6 : code inexistant / expiré / inactif -> refusés.
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ declare r jsonb; begin
  r := public.redeem_promo_code('NIMPORTEQUOI');
  if (r->>'ok') <> 'false' then raise exception 'CC5 ECHEC: code inexistant accepté'; end if;
  r := public.redeem_promo_code('OLD2020');
  if (r->>'ok') <> 'false' then raise exception 'CC6 ECHEC: code expiré accepté'; end if;
  r := public.redeem_promo_code('OFF');
  if (r->>'ok') <> 'false' then raise exception 'CC6b ECHEC: code inactif accepté'; end if;
  raise notice 'OK CC5/6: codes inexistant/expiré/inactif refusés';
end $$;
reset role;

-- CONTRE-CAS 7 : non authentifié -> refusé.
do $$ declare r jsonb; begin
  perform set_config('test.uid', '', false);
  r := public.redeem_promo_code('GOLD2026');
  if (r->>'ok') <> 'false' then raise exception 'CC7 ECHEC: rédemption acceptée sans auth'; end if;
  raise notice 'OK CC7: rédemption sans authentification refusée';
end $$;

-- CONTRE-CAS 8 : le client ne peut PAS lire la table des codes (pas d'énumération).
do $$ begin
  if has_table_privilege('authenticated', 'public.promo_codes', 'SELECT')
     or has_table_privilege('anon', 'public.promo_codes', 'SELECT') then
    raise exception 'CC8 FUITE: le client peut lire promo_codes (énumération possible)';
  end if;
  raise notice 'OK CC8: promo_codes non lisible par le client (pas d''énumération)';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
