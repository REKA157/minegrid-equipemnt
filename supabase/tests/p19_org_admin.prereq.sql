-- Prereq P19 — org + membres + helper user_in_org_admin (minimal) pour tester
-- remove_org_member / set_org_member_role après réécriture (sans SELECT ... INTO).
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public, auth to authenticated;

create table public.organizations (id uuid primary key);
create table public.organization_members (
  organization_id uuid,
  user_id         uuid,
  role            text,
  created_at      timestamptz not null default now()
);
grant select on public.organizations, public.organization_members to authenticated;

-- Helper minimal (owner/admin de l'org) — même contrat que la prod.
create or replace function public.user_in_org_admin(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = p_uid and m.role in ('owner', 'admin')
  );
$$;

-- Org O1 : owner=U1, admin=U2, viewer=U3
insert into public.organizations(id) values ('0e000000-0000-0000-0000-0000000000f1');
insert into public.organization_members(organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('0e000000-0000-0000-0000-0000000000f1', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('0e000000-0000-0000-0000-0000000000f1', '33333333-3333-3333-3333-333333333333', 'viewer');
