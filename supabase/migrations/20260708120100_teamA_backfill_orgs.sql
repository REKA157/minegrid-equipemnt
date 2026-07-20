-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 0 (rattachement) : attacher l'existant à une société.
--
-- Pour chaque `pro_clients` (= une société abonnée), créer UNE organisation
-- possédée par son `user_id`, puis rattacher les leads de ce vendeur à cette
-- organisation et poser l'assignation par défaut = le vendeur.
--
-- S'exécute côté serveur (auth.uid() NULL -> le trigger leads_guard_fn ne
-- réécrit pas organization_id, on peut donc le poser directement).
-- Idempotent (ne recrée pas d'org si l'utilisateur est déjà membre ;
-- ne rattache que les leads encore sans société).
-- No-op si la table pro_clients n'existe pas (ex. base de test).
-- =====================================================================

-- (Délimiteur nommé + affectations scalaires : l'éditeur SQL Supabase gère mal
--  les $$ multiples et mange les SELECT ... INTO.)
do $do_backfill$
declare
  r record;
  v_org uuid;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pro_clients'
  ) then
    raise notice 'pro_clients absente : rattachement ignoré (no-op).';
    return;
  end if;

  for r in
    select p.user_id, coalesce(nullif(trim(p.company_name), ''), 'Ma société') as company_name
    from public.pro_clients p
    where p.user_id is not null
      -- Ignorer les pro_clients dont le compte n'existe pas (données de démo/orphelines).
      and exists (select 1 from auth.users u where u.id = p.user_id)
  loop
    -- Déjà rattaché à une organisation ? On ne recrée pas.
    v_org := (
      select organization_id
      from public.organization_members
      where user_id = r.user_id
      order by (role = 'owner') desc
      limit 1
    );

    if v_org is null then
      insert into public.organizations (name) values (r.company_name) returning id into v_org;
      insert into public.organization_members (organization_id, user_id, role)
      values (v_org, r.user_id, 'owner');
    end if;
  end loop;
end $do_backfill$;

-- Rattacher les leads à la société de leur vendeur (owner de l'org).
update public.leads l
set organization_id = m.organization_id
from public.organization_members m
where l.organization_id is null
  and m.user_id = l.seller_id
  and m.role = 'owner';

-- Assignation par défaut = le vendeur, UNIQUEMENT si c'est un vrai compte
-- (la clé étrangère assigned_to_user_id -> auth.users l'exige ; les leads dont
--  le seller_id est un UUID de démo/orphelin restent simplement non assignés).
update public.leads l
set assigned_to_user_id = l.seller_id
where l.assigned_to_user_id is null
  and l.seller_id is not null
  and exists (select 1 from auth.users u where u.id = l.seller_id);
