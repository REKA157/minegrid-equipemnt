-- =====================================================================
-- P19 — Gestion réelle des membres (retrait + changement de rôle) côté serveur
-- =====================================================================
-- FAILLE : dans MultiUserManagement, « supprimer un membre » et « changer son
-- rôle » ne modifiaient que l'état LOCAL (localStorage/state) -> aucun accès n'était
-- réellement coupé côté serveur (un membre « supprimé » gardait tous ses droits).
--
-- CORRECTIF : 2 RPC SECURITY DEFINER gardées (admin/owner de la MÊME société) :
--   - remove_org_member  : retire la ligne organization_members (l'accès est coupé) ;
--   - set_org_member_role : change le rôle société.
-- Règles : réservé aux admins/owner de l'org de la cible ; le PROPRIÉTAIRE ne peut
-- être ni retiré ni rétrogradé ; rôle limité à admin/manager/viewer.
-- Délimiteur $fn$, idempotent.
-- =====================================================================

create or replace function public.remove_org_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org  uuid;
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  select organization_id, role into v_org, v_role
  from public.organization_members
  where user_id = p_user_id
  order by created_at
  limit 1;

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Membre introuvable');
  end if;
  if not public.user_in_org_admin(v_org, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Réservé aux administrateurs de la société');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Le propriétaire ne peut pas être retiré');
  end if;

  delete from public.organization_members where organization_id = v_org and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.set_org_member_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org  uuid;
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;
  if p_role not in ('admin', 'manager', 'viewer') then
    return jsonb_build_object('ok', false, 'error', 'Rôle invalide');
  end if;

  select organization_id, role into v_org, v_role
  from public.organization_members
  where user_id = p_user_id
  order by created_at
  limit 1;

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Membre introuvable');
  end if;
  if not public.user_in_org_admin(v_org, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Réservé aux administrateurs de la société');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Le rôle du propriétaire ne peut pas être changé');
  end if;

  update public.organization_members set role = p_role
  where organization_id = v_org and user_id = p_user_id;
  return jsonb_build_object('ok', true, 'role', p_role);
end;
$fn$;

revoke execute on function public.remove_org_member(uuid) from public;
revoke execute on function public.set_org_member_role(uuid, text) from public;
grant execute on function public.remove_org_member(uuid) to authenticated;
grant execute on function public.set_org_member_role(uuid, text) to authenticated;
