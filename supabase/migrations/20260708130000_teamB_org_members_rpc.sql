-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 3 : lister les VRAIS membres d'une société.
--
-- get_org_members() renvoie les membres des organisations auxquelles
-- l'appelant (auth.uid()) appartient, enrichis du nom / email / téléphone /
-- dernière connexion.
--
-- SOURCE DES IDENTITÉS : auth.users (garantie d'exister). Ce projet ne crée
-- AUCUNE table de profil (pas de public.user_profiles ni public.profiles) —
-- les noms sont stockés dans auth.users.raw_user_meta_data (= user_metadata),
-- posés à l'inscription (src/utils/api/auth.ts). Les clés varient selon le
-- compte (camelCase firstName/lastName à l'inscription, parfois full_name /
-- first_name) : on tolère les deux via coalesce.
--
-- SÉCURITÉ :
--  - SECURITY DEFINER : peut lire auth.users (le rôle `authenticated` ne le
--    peut pas directement) ;
--  - STRICTEMENT scopée : le self-join `me` impose que l'appelant soit
--    lui-même membre de l'organisation renvoyée -> un membre de la société A
--    ne voit JAMAIS les membres de la société B ;
--  - AUCUN paramètre `uid` (sinon on pourrait lister une autre société) ;
--  - search_path=public verrouillé.
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
    -- prénom : on tente les variantes connues ; si seul un nom complet existe,
    -- il atterrit ici (le frontend compose "prénom nom" et retombe sur l'email).
    coalesce(
      au.raw_user_meta_data ->> 'firstName',
      au.raw_user_meta_data ->> 'first_name',
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name'
    ) as first_name,
    coalesce(
      au.raw_user_meta_data ->> 'lastName',
      au.raw_user_meta_data ->> 'last_name'
    ) as last_name,
    au.email,
    coalesce(
      au.raw_user_meta_data ->> 'phone',
      au.raw_user_meta_data ->> 'telephone'
    ) as phone,
    au.last_sign_in_at
  from public.organization_members m
  -- le self-join impose que l'appelant soit membre de la même org : le scope.
  join public.organization_members me
    on me.organization_id = m.organization_id
   and me.user_id = auth.uid()
  join auth.users au on au.id = m.user_id
  order by
    case m.role
      when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3
    end,
    m.created_at;
$$;

grant execute on function public.get_org_members() to authenticated;
