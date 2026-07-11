-- =====================================================================
-- Phase G — RLS `vitrines` : édition réservée au PROPRIÉTAIRE
-- =====================================================================
-- La table `vitrines` (vitrine personnalisée de la société) n'avait AUCUNE RLS
-- versionnée : un utilisateur authentifié pouvait modifier/supprimer la vitrine
-- d'un AUTRE via l'API directe. On aligne sur le patron `machines`.
--
-- APRÈS :
--   - SELECT public (les vitrines sont des pages publiques) ;
--   - INSERT authentifié + trigger FORCE user_id = auth.uid() (anti-usurpation) ;
--   - UPDATE / DELETE réservés au propriétaire (user_id = auth.uid()).
--
-- DÉFENSIF : si la table `public.vitrines` n'existe pas encore (feature non
-- déployé sur cette base), la migration ne fait RIEN (au lieu de planter). Elle
-- s'appliquera automatiquement à la ré-exécution une fois la table créée.
-- Idempotent.
-- =====================================================================

-- Fonction anti-usurpation (indépendante de la table — créée dans tous les cas).
create or replace function public.vitrines_force_owner_fn()
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
  if to_regclass('public.vitrines') is null then
    raise notice 'Table public.vitrines absente — RLS vitrines ignorée (rien à sécuriser).';
    return;
  end if;

  execute 'alter table public.vitrines enable row level security';

  -- Purge de TOUTES les policies existantes (dont d'éventuels USING(true)).
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'vitrines'
  loop
    execute format('drop policy if exists %I on public.vitrines', pol.policyname);
  end loop;

  execute 'drop trigger if exists trg_vitrines_force_owner on public.vitrines';
  execute 'create trigger trg_vitrines_force_owner before insert on public.vitrines '
       || 'for each row execute function public.vitrines_force_owner_fn()';

  execute 'create policy vitrines_select_public on public.vitrines for select using (true)';
  execute 'create policy vitrines_insert_own on public.vitrines for insert to authenticated '
       || 'with check (auth.uid() is not null and user_id = auth.uid())';
  execute 'create policy vitrines_update_own on public.vitrines for update to authenticated '
       || 'using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'create policy vitrines_delete_own on public.vitrines for delete to authenticated '
       || 'using (user_id = auth.uid())';

  raise notice 'RLS vitrines appliquée (édition réservée au propriétaire).';
end $$;
