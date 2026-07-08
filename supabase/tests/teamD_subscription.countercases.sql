-- =====================================================================
-- CONTRE-CAS : abonnement partagé (get_effective_subscription).
-- 'postgres' sème ; SET ROLE authenticated + test.uid incarne un client.
-- Échec d'assertion -> raise exception -> ON_ERROR_STOP sort != 0.
--
-- org A : owner OA (enterprise ACTIF) ; membres MA (sans sub), MA2 (own 'pro' actif)
-- org B : owner OB (enterprise ACTIF)                    [pour l'isolation]
-- org C : owner OC (enterprise EXPIRÉ) ; membre MC (sans sub)
-- org D : owner OD (enterprise 'cancelled') ; membre MD (sans sub)
-- NONE  : aucun org, aucun abonnement
-- =====================================================================

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'),  -- OA owner A
  ('00000000-0000-0000-0000-0000000000a1'),  -- MA  membre A (sans sub)
  ('00000000-0000-0000-0000-0000000000a2'),  -- MA2 membre A (own pro)
  ('00000000-0000-0000-0000-0000000000b0'),  -- OB owner B
  ('00000000-0000-0000-0000-0000000000c0'),  -- OC owner C (expiré)
  ('00000000-0000-0000-0000-0000000000c1'),  -- MC membre C
  ('00000000-0000-0000-0000-0000000000d0'),  -- OD owner D (annulé)
  ('00000000-0000-0000-0000-0000000000d1'),  -- MD membre D
  ('00000000-0000-0000-0000-0000000000ee');  -- NONE

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B'),
  ('0c000000-0000-0000-0000-000000000003', 'Société C'),
  ('0d000000-0000-0000-0000-000000000004', 'Société D');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a0', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'viewer'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'manager'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b0', 'owner'),
  ('0c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c0', 'owner'),
  ('0c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'viewer'),
  ('0d000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d0', 'owner'),
  ('0d000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', 'viewer');

insert into public.pro_clients (user_id, subscription_type, subscription_status, subscription_end) values
  ('00000000-0000-0000-0000-0000000000a0', 'enterprise', 'active',    now() + interval '30 day'),
  ('00000000-0000-0000-0000-0000000000a2', 'pro',        'active',    null),
  ('00000000-0000-0000-0000-0000000000b0', 'enterprise', 'active',    now() + interval '30 day'),
  ('00000000-0000-0000-0000-0000000000c0', 'enterprise', 'active',    now() - interval '1 day'),  -- expiré
  ('00000000-0000-0000-0000-0000000000d0', 'enterprise', 'cancelled', now() + interval '30 day'); -- annulé

-- ============ CC1 : un MEMBRE sans abonnement HÉRITE de l'enterprise du propriétaire ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';   -- MA
do $$ declare r record; begin
  select * into r from public.get_effective_subscription();
  if not r.is_active then raise exception '1 ECHEC: le membre n herite pas (inactif)'; end if;
  if r.type <> 'enterprise' then raise exception '1 ECHEC: type herite incorrect (%)', r.type; end if;
  if r.source <> 'org' then raise exception '1 ECHEC: source devrait etre org (%)', r.source; end if;
  raise notice 'OK 1: un membre sans abonnement herite de l enterprise du proprietaire';
end $$;

-- ============ CC2 : le PROPRIÉTAIRE a bien son abonnement (source self) ============
set test.uid = '00000000-0000-0000-0000-0000000000a0';   -- OA
do $$ declare r record; begin
  select * into r from public.get_effective_subscription();
  if not r.is_active or r.type <> 'enterprise' then raise exception '2 ECHEC: le proprietaire n a pas enterprise'; end if;
  if r.source <> 'self' then raise exception '2 ECHEC: source devrait etre self (%)', r.source; end if;
  raise notice 'OK 2: le proprietaire a son abonnement enterprise (self)';
end $$;

-- ============ CC3 : le MEILLEUR l'emporte — own 'pro' < enterprise hérité ============
set test.uid = '00000000-0000-0000-0000-0000000000a2';   -- MA2 (own pro + org enterprise)
do $$ declare r record; begin
  select * into r from public.get_effective_subscription();
  if r.type <> 'enterprise' then raise exception '3 ECHEC: le meilleur (enterprise) ne l emporte pas (%)', r.type; end if;
  if r.source <> 'org' then raise exception '3 ECHEC: source devrait etre org (%)', r.source; end if;
  raise notice 'OK 3: entre son pro et l enterprise du proprietaire, l enterprise l emporte';
end $$;

-- ============ CC4 : propriétaire EXPIRÉ -> le membre N'HÉRITE PAS + pas de fuite inter-société ============
set test.uid = '00000000-0000-0000-0000-0000000000c1';   -- MC (org C owner expiré ; B a enterprise mais MC pas dans B)
do $$ declare r record; begin
  select * into r from public.get_effective_subscription();
  if r.is_active then raise exception '4 ECHEC: heritage d un abonnement EXPIRE (ou fuite depuis societe B)'; end if;
  if r.type is not null then raise exception '4 ECHEC: type non nul alors qu inactif (%)', r.type; end if;
  raise notice 'OK 4: proprietaire expire -> pas d heritage, et aucune fuite depuis une autre societe';
end $$;

-- ============ CC5 : propriétaire ANNULÉ (status<>active) -> pas d'héritage ============
set test.uid = '00000000-0000-0000-0000-0000000000d1';   -- MD
do $$ declare r record; begin
  select * into r from public.get_effective_subscription();
  if r.is_active then raise exception '5 ECHEC: heritage d un abonnement annule'; end if;
  raise notice 'OK 5: proprietaire annule (status<>active) -> pas d heritage';
end $$;

-- ============ CC6 : ni org ni abonnement -> inactif ============
set test.uid = '00000000-0000-0000-0000-0000000000ee';   -- NONE
do $$ declare r record; begin
  select * into r from public.get_effective_subscription();
  if r.is_active then raise exception '6 ECHEC: actif sans org ni abonnement'; end if;
  if r.type is not null then raise exception '6 ECHEC: type non nul (%)', r.type; end if;
  raise notice 'OK 6: aucun org ni abonnement -> inactif';
end $$;
reset role;

-- ============ CC7 : search_path verrouillé ============
do $$ begin
  perform 1 from pg_proc p
   where p.proname = 'get_effective_subscription'
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '7 ECHEC: get_effective_subscription sans search_path=public'; end if;
  raise notice 'OK 7: search_path=public verrouille sur get_effective_subscription';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
