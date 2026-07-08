-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 3 : lister les VRAIS membres d'une société.
--
-- get_org_members() renvoie les membres des organisations auxquelles
-- l'appelant (auth.uid()) appartient, enrichis du profil (nom / email /
-- téléphone) et de la dernière connexion.
--
-- SÉCURITÉ :
--  - SECURITY DEFINER : la fonction peut lire user_profiles / auth.users
--    (que le rôle `authenticated` ne peut PAS lire directement) ;
--  - MAIS elle est STRICTEMENT scopée : le self-join `me` impose que
--    l'appelant soit lui-même membre de l'organisation renvoyée -> un
--    membre de la société A ne voit JAMAIS les membres de la société B ;
--  - AUCUN paramètre `uid` : sinon un client pourrait passer l'uid d'un
--    tiers pour lister les membres d'une autre société.
--  - search_path=public verrouillé (anti-hijack de la résolution de noms).
-- Idempotente (CREATE OR REPLACE).
-- =====================================================================

create or replace function public.get_org_members()
returns table (
  user_id         uuid,
  organization_id uuid,
  role            text,
  member_since    timestamptz,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.user_id,
    m.organization_id,
    m.role,
    m.created_at as member_since,
    up.first_name,
    up.last_name,
    coalesce(up.email, au.email) as email,
    up.phone,
    au.last_sign_in_at
  from public.organization_members m
  -- le self-join impose que l'appelant soit membre de la même org : le scope.
  join public.organization_members me
    on me.organization_id = m.organization_id
   and me.user_id = auth.uid()
  left join public.user_profiles up on up.id = m.user_id
  left join auth.users au on au.id = m.user_id
  order by
    case m.role
      when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3
    end,
    m.created_at;
$$;

grant execute on function public.get_org_members() to authenticated;
