-- =====================================================================
-- p28 — CONSOLE D'ADMINISTRATION : boîte de réception Contact et codes promo
--
-- Dépend de p26 (is_platform_admin, log_admin_action).
--
-- DEUX MANQUES QUI COÛTENT DE L'ARGENT AUJOURD'HUI
--
--   1. Les messages du formulaire de contact arrivent bien en base
--      (`contact_messages`), mais AUCUN écran ne les lit — vérifié par recherche
--      dans tout `src/`. Des demandes commerciales s'empilent sans que personne
--      les voie. Un prospect qui écrit et n'obtient jamais de réponse est un
--      client perdu, et il n'y a même pas de trace du manque à gagner.
--
--   2. Tant que Paddle « live » n'existe pas, le CODE PROMO est le seul moyen
--      propre d'activer un client payant. Il fallait jusqu'ici l'insérer à la
--      main dans la base, sans trace ni contrôle.
--
-- AU PASSAGE — DROITS TROP LARGES SUR contact_messages
--   La baseline accorde `SELECT, INSERT, UPDATE` à `authenticated`. Aujourd'hui
--   la RLS sauve la mise : il n'existe qu'une policy d'INSERT, donc la lecture
--   est refusée. Mais c'est exactement le montage qui a produit la faille p25 :
--   le jour où une policy de lecture apparaît, tout compte connecté lit TOUS les
--   messages — noms, e-mails, sociétés, contenus, adresses IP. On révoque.
--
-- CHOIX DE JOURNALISATION, assumé : les CHANGEMENTS d'état sont journalisés,
--   pas chaque ouverture de la boîte. Journaliser chaque affichage noierait le
--   journal sous le bruit et rendrait illisibles les gestes qui comptent. La
--   consultation d'une fiche CLIENT, elle, reste tracée (p27) : c'est un accès
--   ciblé à une personne, pas la lecture d'une boîte aux lettres.
--
-- Idempotente. Délimiteurs nommés.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Resserrer les droits sur contact_messages
-- ---------------------------------------------------------------------
-- L'insertion publique reste (c'est le formulaire du site). La lecture et la
-- modification passent désormais exclusivement par les fonctions ci-dessous.
revoke select, update, delete on table public.contact_messages from authenticated;
revoke select, update, delete on table public.contact_messages from anon;

-- ---------------------------------------------------------------------
-- 1. Boîte de réception
-- ---------------------------------------------------------------------

create or replace function public.admin_list_contact_messages(
  p_statut  text default null,
  p_limite  integer default 100
)
returns table (
  id         uuid,
  created_at timestamptz,
  name       text,
  email      text,
  company    text,
  subject    text,
  message    text,
  service    text,
  status     text
)
language plpgsql
security definer
set search_path = public
as $fn_list_contact$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;

  return query
    select c.id, c.created_at, c.name, c.email, c.company, c.subject, c.message,
           c.service, c.status
    from public.contact_messages c
    where p_statut is null or p_statut = 'tous' or c.status = p_statut
    order by c.created_at desc
    limit least(coalesce(p_limite, 100), 500);
end
$fn_list_contact$;

grant execute on function public.admin_list_contact_messages(text, integer) to authenticated;

-- Compteur des non-lus, pour la pastille de l'onglet.
create or replace function public.admin_contact_unread_count()
returns integer
language plpgsql
security definer
set search_path = public
stable
as $fn_contact_unread$
declare
  n integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  n := (select count(*)::int from public.contact_messages where status = 'new');
  return coalesce(n, 0);
end
$fn_contact_unread$;

grant execute on function public.admin_contact_unread_count() to authenticated;

create or replace function public.admin_set_contact_status(
  p_id     uuid,
  p_statut text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn_set_contact$
declare
  v_statut text := lower(btrim(coalesce(p_statut, '')));
  v_avant  text;
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  -- Bornes du CHECK de la table : au-delà, Postgres renverrait un message illisible.
  if v_statut not in ('new', 'read', 'replied', 'archived') then
    raise exception 'Statut invalide (new, read, replied ou archived).' using errcode = '22023';
  end if;

  select c.status into v_avant from public.contact_messages c where c.id = p_id;
  if not found then
    raise exception 'Message introuvable.' using errcode = 'P0002';
  end if;

  update public.contact_messages set status = v_statut where id = p_id;

  -- Motif implicite : le geste EST son propre motif (marquer lu / répondu /
  -- archivé). Exiger une phrase écrite à chaque clic ferait renoncer à classer,
  -- et une boîte non classée ne sert à rien.
  perform public.log_admin_action(
    'contact.statut', 'Passage à « ' || v_statut || ' »', 'contact_message', p_id::text,
    jsonb_build_object('avant', v_avant, 'apres', v_statut)
  );

  return true;
end
$fn_set_contact$;

grant execute on function public.admin_set_contact_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Codes promo
-- ---------------------------------------------------------------------

create or replace function public.admin_list_promo_codes()
returns table (
  id                uuid,
  code              text,
  subscription_type text,
  duration_days     integer,
  max_uses          integer,
  uses_count        integer,
  expires_at        timestamptz,
  active            boolean,
  created_at        timestamptz,
  utilisable        boolean
)
language plpgsql
security definer
set search_path = public
as $fn_list_promo$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;

  return query
    select p.id, p.code, p.subscription_type, p.duration_days, p.max_uses,
           p.uses_count, p.expires_at, p.active, p.created_at,
           -- « Utilisable » croise les TROIS conditions. Afficher le seul
           -- drapeau `active` laisserait croire qu'un code épuisé fonctionne.
           (p.active
             and (p.expires_at is null or p.expires_at > now())
             and p.uses_count < p.max_uses)
    from public.promo_codes p
    order by p.created_at desc;
end
$fn_list_promo$;

grant execute on function public.admin_list_promo_codes() to authenticated;

create or replace function public.admin_create_promo_code(
  p_code     text,
  p_plan     text,
  p_jours    integer,
  p_max_uses integer,
  p_expire   timestamptz,
  p_reason   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_create_promo$
declare
  v_id   uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_plan text := lower(btrim(coalesce(p_plan, 'enterprise')));
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  if length(v_code) < 4 then
    raise exception 'Code trop court (4 caractères minimum).' using errcode = '22023';
  end if;
  if v_plan not in ('pro', 'premium', 'enterprise') then
    raise exception 'Palier invalide.' using errcode = '22023';
  end if;
  if p_jours is null or p_jours <= 0 or p_jours > 365 then
    raise exception 'Durée invalide : entre 1 et 365 jours.' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses <= 0 or p_max_uses > 10000 then
    raise exception 'Nombre d''utilisations invalide : entre 1 et 10000.' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Un motif écrit est obligatoire.' using errcode = '22023';
  end if;
  -- Un code déjà pris ne doit pas écraser l'ancien en silence : deux campagnes
  -- se mélangeraient, et le compteur d'utilisations avec.
  if exists (select 1 from public.promo_codes where upper(code) = v_code) then
    raise exception 'Ce code existe déjà.' using errcode = '23505';
  end if;

  insert into public.promo_codes
    (code, subscription_type, duration_days, max_uses, expires_at, active)
  values (v_code, v_plan, p_jours, p_max_uses, p_expire, true)
  returning id into v_id;

  perform public.log_admin_action(
    'promo.creation', p_reason, 'promo_code', v_id::text,
    jsonb_build_object('code', v_code, 'plan', v_plan, 'jours', p_jours, 'max_uses', p_max_uses)
  );

  return v_id;
end
$fn_create_promo$;

grant execute on function public.admin_create_promo_code(text, text, integer, integer, timestamptz, text) to authenticated;

create or replace function public.admin_set_promo_active(
  p_id     uuid,
  p_active boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn_toggle_promo$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Un motif écrit est obligatoire.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.promo_codes where id = p_id) then
    raise exception 'Code promo introuvable.' using errcode = 'P0002';
  end if;

  update public.promo_codes set active = coalesce(p_active, false) where id = p_id;

  perform public.log_admin_action(
    case when p_active then 'promo.activation' else 'promo.desactivation' end,
    p_reason, 'promo_code', p_id::text, '{}'::jsonb
  );

  return true;
end
$fn_toggle_promo$;

grant execute on function public.admin_set_promo_active(uuid, boolean, text) to authenticated;

-- Qui a utilisé un code, et quand.
create or replace function public.admin_promo_redemptions(p_id uuid)
returns table (
  email       text,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn_promo_uses$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  return query
    select lower(au.email), r.redeemed_at
    from public.promo_redemptions r
    join auth.users au on au.id = r.user_id
    where r.promo_code_id = p_id
    order by r.redeemed_at desc;
end
$fn_promo_uses$;

grant execute on function public.admin_promo_redemptions(uuid) to authenticated;
