-- =====================================================================
-- Phase G — RLS `documents` : documents PRIVÉS (chacun les siens)
-- =====================================================================
-- La table `documents` (espace documents perso, DocumentsEspace) était lue avec
-- .eq('user_id',…) mais SUPPRIMÉE par id seul : sans RLS, un utilisateur pouvait
-- LIRE et SUPPRIMER les documents d'un AUTRE via l'API directe.
--
-- APRÈS (documents = PRIVÉS, pas de lecture publique) :
--   - SELECT / UPDATE / DELETE réservés au propriétaire (user_id = auth.uid()) ;
--   - INSERT authentifié + trigger FORCE user_id = auth.uid().
-- NB : DocumentsTab (Espace Pro) utilise le BUCKET Storage `documents`, pas la
--      table `public.documents` — non impacté.
--
-- DÉFENSIF : si la table `public.documents` n'existe pas, la migration ne fait
-- RIEN (au lieu de planter). Idempotent.
-- =====================================================================

create or replace function public.documents_force_owner_fn()
returns trigger
language plpgsql security invoker set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

do $$
declare pol record;
begin
  if to_regclass('public.documents') is null then
    raise notice 'Table public.documents absente — RLS documents ignorée (rien à sécuriser).';
    return;
  end if;

  execute 'alter table public.documents enable row level security';

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'documents'
  loop
    execute format('drop policy if exists %I on public.documents', pol.policyname);
  end loop;

  execute 'drop trigger if exists trg_documents_force_owner on public.documents';
  execute 'create trigger trg_documents_force_owner before insert on public.documents '
       || 'for each row execute function public.documents_force_owner_fn()';

  execute 'create policy documents_select_own on public.documents for select to authenticated '
       || 'using (user_id = auth.uid())';
  execute 'create policy documents_insert_own on public.documents for insert to authenticated '
       || 'with check (auth.uid() is not null and user_id = auth.uid())';
  execute 'create policy documents_update_own on public.documents for update to authenticated '
       || 'using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'create policy documents_delete_own on public.documents for delete to authenticated '
       || 'using (user_id = auth.uid())';

  raise notice 'RLS documents appliquée (documents privés).';
end $$;
