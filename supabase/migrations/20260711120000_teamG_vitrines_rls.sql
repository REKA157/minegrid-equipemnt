-- =====================================================================
-- Phase G — RLS `vitrines` : édition réservée au PROPRIÉTAIRE
-- =====================================================================
-- La table `vitrines` (vitrine personnalisée de la société) n'avait AUCUNE RLS
-- versionnée : un utilisateur authentifié pouvait modifier/supprimer la vitrine
-- d'un AUTRE via l'API directe (le garde canEdit côté client était la seule
-- protection). On aligne sur le patron `machines` (20260702090100).
--
-- APRÈS :
--   - SELECT public (les vitrines sont des pages publiques).
--   - INSERT réservé aux authentifiés ; un trigger FORCE user_id = auth.uid()
--     (impossible d'usurper le propriétaire ; imports service_role NULL laissés).
--   - UPDATE / DELETE réservés au propriétaire réel (user_id = auth.uid()).
-- Idempotent.
-- =====================================================================

alter table public.vitrines enable row level security;

-- 1) Purge de TOUTES les policies existantes (dont d'éventuels USING(true)).
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'vitrines'
  loop
    execute format('drop policy if exists %I on public.vitrines', pol.policyname);
  end loop;
end $$;

-- 2) Trigger anti-usurpation : la propriété est TOUJOURS forcée à auth.uid()
--    pour un utilisateur authentifié (le client ne peut pas mentir).
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

drop trigger if exists trg_vitrines_force_owner on public.vitrines;
create trigger trg_vitrines_force_owner
  before insert on public.vitrines
  for each row execute function public.vitrines_force_owner_fn();

-- 3) Policies strictes.
create policy vitrines_select_public on public.vitrines
  for select using (true);

create policy vitrines_insert_own on public.vitrines
  for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

create policy vitrines_update_own on public.vitrines
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy vitrines_delete_own on public.vitrines
  for delete to authenticated
  using (user_id = auth.uid());
