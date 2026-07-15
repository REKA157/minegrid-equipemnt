-- Prereq P21 (A) — toutes les tables présentes : machine_views, offers, messages.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public, auth to authenticated;

create table public.machine_views (machine_id uuid);
create table public.offers        (machine_id uuid, seller_id uuid);
create table public.messages      (machine_id uuid, receiver_id uuid, seller_id uuid);
grant select on public.machine_views, public.offers, public.messages to authenticated;

-- M1 = aaaa, M2 = bbbb ; U1 = 1111, U2 = 2222
insert into public.machine_views(machine_id)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' from generate_series(1, 3);      -- views(M1)=3
insert into public.offers(machine_id, seller_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),  -- U1
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),  -- U1
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222');  -- U2 (ne doit PAS compter pour U1)
insert into public.messages(machine_id, receiver_id, seller_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', null),  -- U1
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', null);  -- U1
