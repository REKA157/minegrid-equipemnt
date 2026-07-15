-- Prereq P21 (B) — `offers` ABSENTE (cas prod réel qui faisait échouer le bundle).
-- Seules machine_views + messages existent. La migration DOIT quand même créer la
-- fonction (plpgsql) et l'appel doit fonctionner, offers comptant pour 0.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public, auth to authenticated;

create table public.machine_views (machine_id uuid);
create table public.messages      (machine_id uuid, receiver_id uuid, seller_id uuid);
-- PAS de table public.offers
grant select on public.machine_views, public.messages to authenticated;

insert into public.machine_views(machine_id)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' from generate_series(1, 3);      -- views(M1)=3
insert into public.messages(machine_id, receiver_id, seller_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', null);
