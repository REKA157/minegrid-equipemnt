-- =====================================================================
-- Preuve locale P22 — la réécriture auth.uid() -> (select auth.uid())
-- (a) réécrit bien une policy nue, (b) ne double-emballe pas une policy déjà
-- optimisée, (c) préserve EXACTEMENT l'accès (mêmes lignes / contre-cas bloqué),
-- (d) est idempotente. À piper dans un Postgres jetable, ON_ERROR_STOP=1.
-- =====================================================================

-- --- Stub auth.uid() : lit le GUC test.uid (comme le harnais existant) --------
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

-- --- Rôle applicatif -----------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
-- Un schéma public RECRÉÉ (reset_db du runner) ne concède plus USAGE par défaut (PG15) :
grant usage on schema public, auth to authenticated;

-- --- Données de test ------------------------------------------------------------
-- t1 : policies NUES (SELECT USING + INSERT WITH CHECK)
create table public.t1 (id int primary key, owner uuid not null);
alter table public.t1 enable row level security;
grant select, insert on public.t1 to authenticated;
create policy t1_sel on public.t1 for select using (auth.uid() = owner);
create policy t1_ins on public.t1 for insert with check (auth.uid() = owner);

-- t2 : policy DÉJÀ optimisée -> ne doit PAS être re-touchée
create table public.t2 (id int primary key, owner uuid not null);
alter table public.t2 enable row level security;
grant select on public.t2 to authenticated;
create policy t2_sel on public.t2 for select using ((select auth.uid()) = owner);

-- t3 : helper SECURITY DEFINER recevant auth.uid() en ARGUMENT (cas fréquent)
create table public.members (org uuid not null, uid uuid not null);
create or replace function public.can_see(p_org uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.members m where m.org = p_org and m.uid = p_uid) $$;
create table public.t3 (id int primary key, org uuid not null);
alter table public.t3 enable row level security;
grant select on public.t3 to authenticated;
create policy t3_sel on public.t3 for select using (public.can_see(org, auth.uid()));

-- Seed
insert into public.t1(id, owner) values
  (1, '11111111-1111-1111-1111-111111111111'),
  (2, '11111111-1111-1111-1111-111111111111'),
  (3, '22222222-2222-2222-2222-222222222222');
insert into public.t2(id, owner) values
  (1, '11111111-1111-1111-1111-111111111111'),
  (2, '22222222-2222-2222-2222-222222222222');
insert into public.members(org, uid) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');
insert into public.t3(id, org) values
  (1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  (2, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- =====================================================================
-- BASELINE : comportement AVANT migration (doit rester identique APRÈS)
-- =====================================================================
do $t$
declare n int;
begin
  set local role authenticated;
  set local test.uid = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.t1;      -- u_a voit ses 2 lignes
  if n <> 2 then raise exception 'BASELINE t1 u_a attendu 2, obtenu %', n; end if;
  select count(*) into n from public.t3;       -- u_a membre de org aaaa -> voit t3 #1
  if n <> 1 then raise exception 'BASELINE t3 u_a attendu 1, obtenu %', n; end if;
  reset role;
end $t$;

-- =====================================================================
-- >>> ICI : le contenu de la migration p22 est concaténé par le runner <<<
-- =====================================================================
