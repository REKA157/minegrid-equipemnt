-- =====================================================================
-- Table `contact_messages` : stockage des messages envoyés depuis le
-- formulaire de contact public (src/pages/Contact.tsx).
--
-- A executer dans l'editeur SQL Supabase (en dev/staging/prod selon besoin).
-- =====================================================================

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  company     text,
  subject     text not null,
  message     text not null,
  service     text,
  status      text not null default 'new',   -- 'new' | 'read' | 'replied' | 'archived'
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- Contraintes metier minimales pour limiter les payloads invalides/abusifs.
alter table public.contact_messages
  drop constraint if exists contact_messages_status_check;
alter table public.contact_messages
  add constraint contact_messages_status_check
  check (status in ('new', 'read', 'replied', 'archived'));

alter table public.contact_messages
  drop constraint if exists contact_messages_name_len_check;
alter table public.contact_messages
  add constraint contact_messages_name_len_check
  check (char_length(trim(name)) between 2 and 120);

alter table public.contact_messages
  drop constraint if exists contact_messages_subject_len_check;
alter table public.contact_messages
  add constraint contact_messages_subject_len_check
  check (char_length(trim(subject)) between 3 and 180);

alter table public.contact_messages
  drop constraint if exists contact_messages_message_len_check;
alter table public.contact_messages
  add constraint contact_messages_message_len_check
  check (char_length(trim(message)) between 10 and 5000);

alter table public.contact_messages
  drop constraint if exists contact_messages_email_format_check;
alter table public.contact_messages
  add constraint contact_messages_email_format_check
  check (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$');

-- Index utiles pour le tri/filtrage cote admin.
create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
create index if not exists contact_messages_status_idx
  on public.contact_messages (status);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.contact_messages enable row level security;

drop policy if exists "anon can insert contact messages" on public.contact_messages;
create policy "anon can insert contact messages"
  on public.contact_messages
  for insert
  to anon, authenticated
  with check (true);

-- Droits PostgREST explicites (moindre privilege).
revoke all on table public.contact_messages from anon, authenticated;
grant insert on table public.contact_messages to anon, authenticated;
grant select, update on table public.contact_messages to authenticated;

-- Optionnel: lecture de ses propres messages par utilisateur authentifie.
-- drop policy if exists "user can read own contact messages" on public.contact_messages;
-- create policy "user can read own contact messages"
--   on public.contact_messages
--   for select
--   to authenticated
--   using (email = auth.jwt() ->> 'email');