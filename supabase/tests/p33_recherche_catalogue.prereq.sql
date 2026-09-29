-- Reproduit le strict minimum du schema reel pour tester p33.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  model text,
  category text,
  year integer,
  price text,
  description text,
  sellerid uuid,
  created_at timestamptz default now()
);
alter table public.machines enable row level security;
create policy machines_lecture_publique on public.machines for select to anon, authenticated using (true);
grant select on public.machines to anon, authenticated;

-- Jeu d'essai qui reproduit les cas REELS observes en production.
insert into public.machines (name, brand, model, category, year, price) values
  ('Hitachi ZX350', 'Hitachi', 'ZX350', 'pelle-chenilles', 2018, '450000'),
  ('Volvo G940',    'Volvo',   'G940',  'niveleuse',       2009, '120000.50'),
  ('CAT 140K',      'CAT',     '140K',  'niveleuse',       2015, '1 250 000'),   -- espaces
  ('Komatsu PC210', 'Komatsu', 'PC210', 'pelle-chenilles', 2020, '95 000 EUR'),  -- unite collee
  ('Grue sans prix','Liebherr','LTM',   'grue-mobile',     2012, 'Sur demande'), -- non numerique
  ('Prix vide',     'Bomag',   'BW',    'compacteur',      2016, ''),            -- vide
  ('Prix nul',      'Doosan',  'DX',    'pelle-chenilles', 2017, null),          -- null
  ('Prix pourri',   'Hyundai', 'R',     'pelle-chenilles', 2019, '12.34.56');    -- deux points
