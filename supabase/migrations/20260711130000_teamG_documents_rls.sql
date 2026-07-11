-- =====================================================================
-- Phase G — Table `documents` (si absente) + RLS : documents PRIVÉS
-- =====================================================================
-- La table `documents` (espace documents perso, DocumentsEspace) n'existait pas
-- sur la base. On la CRÉE (colonnes alignées sur DocumentsEspace) et on pose une
-- RLS PRIVÉE (chacun ne voit/écrit QUE les siens).
--
--   - SELECT / UPDATE / DELETE réservés au propriétaire (user_id = auth.uid()) ;
--   - INSERT authentifié + trigger FORCE user_id = auth.uid().
-- NB : DocumentsTab (Espace Pro) utilise le BUCKET Storage `documents`, pas cette
--      table — non impacté.
-- Idempotent.
-- =====================================================================

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  name        text,
  type        text,
  category    text,
  file_url    text,
  file_size   bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  description text,
  tags        text[] default '{}',
  status      text default 'active'
);

create index if not exists documents_user_id_idx on public.documents (user_id);

grant select, insert, update, delete on public.documents to authenticated;

-- Délimiteur nommé $fn$ (et non $$) : l'éditeur SQL de Supabase gère mal les $$ multiples.
create or replace function public.documents_force_owner_fn()
returns trigger
language plpgsql security invoker set search_path = public
as $fn$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$fn$;

alter table public.documents enable row level security;

-- Suppression explicite (idempotent) : pas de bloc do $$ (délimiteur ambigu dans Supabase).
drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;

drop trigger if exists trg_documents_force_owner on public.documents;
create trigger trg_documents_force_owner
  before insert on public.documents
  for each row execute function public.documents_force_owner_fn();

create policy documents_select_own on public.documents
  for select to authenticated
  using (user_id = auth.uid());

create policy documents_insert_own on public.documents
  for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

create policy documents_update_own on public.documents
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy documents_delete_own on public.documents
  for delete to authenticated
  using (user_id = auth.uid());
