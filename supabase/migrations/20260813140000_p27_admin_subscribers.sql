-- =====================================================================
-- p27 — CONSOLE D'ADMINISTRATION : écran « Abonnés » et gestes de dépannage
--
-- Dépend de p26 (platform_admins, is_platform_admin, log_admin_action).
--
-- L'écran ouvert dix fois par jour : qui est abonné, à quoi, jusqu'à quand — et
-- les quatre gestes qui répondent à « mon accès ne marche pas » : prolonger,
-- changer de palier, suspendre, réactiver.
--
-- CE QUI EST VISIBLE, ET CE QUI NE L'EST PAS (RGPD)
--   Visible : identité du titulaire, société, palier, statut, échéance, sièges,
--   moyen de paiement, compteurs. JAMAIS : le contenu des messages privés, les
--   documents déposés, les espaces appels d'offres, les devis, les dossiers de
--   financement, ni les clés d'API des clients. Ces fonctions ne renvoient que
--   les colonnes énumérées ci-dessous — pas `select *`.
--
--   La CONSULTATION d'une fiche client est journalisée, pas seulement les
--   modifications : savoir qui a regardé quoi fait partie de la traçabilité.
--
-- TROIS PIÈGES DE CHIFFRES, tous vérifiés dans le code
--   1. Les codes de palier sont CROISÉS à l'affichage ('pro' = « Premium » 20 $,
--      'premium' = « Pro » 50 $). On ne renvoie donc que le CODE INTERNE : c'est
--      `src/config/plans.ts` qui traduit, comme partout ailleurs.
--   2. `subscription_status` reste 'active' après l'échéance : rien ne balaye les
--      abonnements expirés. Un compteur naïf surévaluerait la base. On renvoie
--      donc `reellement_actif`, qui croise le statut ET la date.
--   3. `payment_amount` n'est pas fiable comme source de chiffre d'affaires
--      (renseignée de façon inégale selon le parcours) : on l'expose telle quelle
--      pour information, et l'écran ne l'additionne pas.
--
-- Idempotente. Délimiteurs nommés.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lister les abonnés
-- ---------------------------------------------------------------------

create or replace function public.admin_list_subscribers(
  p_recherche text default null,
  p_statut    text default null,
  p_limite    integer default 100
)
returns table (
  user_id            uuid,
  email              text,
  company_name       text,
  subscription_type  text,   -- CODE INTERNE : la traduction se fait côté écran
  subscription_status text,
  subscription_start timestamptz,
  subscription_end   timestamptz,
  jours_restants     integer,
  reellement_actif   boolean,
  max_users          integer,
  sieges_utilises    integer,
  payment_method     text,
  promo_code_used    text,
  derniere_connexion timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn_list_subs$
declare
  v_recherche text := nullif(btrim(coalesce(p_recherche, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;

  return query
    select
      pc.user_id,
      lower(au.email),
      pc.company_name,
      pc.subscription_type,
      pc.subscription_status,
      pc.subscription_start,
      pc.subscription_end,
      case
        when pc.subscription_end is null then null
        -- Soustraction de DATES (et non de timestamps) : elle rend un entier de
        -- jours. `timestamptz - timestamptz` donne un intervalle, non castable.
        else greatest(0, (pc.subscription_end::date - now()::date))
      end,
      (pc.subscription_status = 'active'
        and (pc.subscription_end is null or pc.subscription_end > now())),
      pc.max_users,
      coalesce((
        select count(*)::int from public.organization_members om
        where om.organization_id = (
          select om2.organization_id from public.organization_members om2
          where om2.user_id = pc.user_id and om2.role = 'owner' limit 1
        )
      ), 1),
      pc.payment_method,
      pc.promo_code_used,
      au.last_sign_in_at
    from public.pro_clients pc
    join auth.users au on au.id = pc.user_id
    where (v_recherche is null
           or lower(au.email) like '%' || lower(v_recherche) || '%'
           or lower(coalesce(pc.company_name, '')) like '%' || lower(v_recherche) || '%')
      and (p_statut is null
           or p_statut = 'tous'
           or (p_statut = 'actifs'
               and pc.subscription_status = 'active'
               and (pc.subscription_end is null or pc.subscription_end > now()))
           or (p_statut = 'expirent'
               and pc.subscription_end is not null
               and pc.subscription_end > now()
               and pc.subscription_end < now() + interval '7 days')
           or (p_statut = 'inactifs'
               and (pc.subscription_status <> 'active'
                    or (pc.subscription_end is not null and pc.subscription_end <= now()))))
    order by pc.subscription_start desc
    limit least(coalesce(p_limite, 100), 500);
end
$fn_list_subs$;

grant execute on function public.admin_list_subscribers(text, text, integer) to authenticated;

-- Compteurs d'en-tête. Séparés de la liste : ils portent sur TOUTE la base,
-- pas sur la page affichée — sinon « 12 abonnés actifs » voudrait dire
-- « 12 dans les 100 lignes que je regarde », ce qui est faux et trompeur.
create or replace function public.admin_subscriber_stats()
returns table (
  actifs           integer,
  par_palier       jsonb,
  expirent_7j      integer,
  nouveaux_30j     integer,
  sans_paiement    integer
)
language plpgsql
security definer
set search_path = public
as $fn_sub_stats$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;

  return query
    with actifs_reels as (
      select * from public.pro_clients pc
      where pc.subscription_status = 'active'
        and (pc.subscription_end is null or pc.subscription_end > now())
    )
    select
      (select count(*)::int from actifs_reels),
      (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
       from (select subscription_type as t, count(*)::int as n
             from actifs_reels group by subscription_type) x),
      (select count(*)::int from actifs_reels
       where subscription_end is not null and subscription_end < now() + interval '7 days'),
      (select count(*)::int from public.pro_clients
       where subscription_start > now() - interval '30 days'),
      -- Comptes actifs SANS trace de paiement : offerts, code promo, ou activés
      -- à la main. À connaître avant de parler de chiffre d'affaires.
      (select count(*)::int from actifs_reels
       where payment_method is null or payment_method = '' or promo_code_used is not null);
end
$fn_sub_stats$;

grant execute on function public.admin_subscriber_stats() to authenticated;

-- Fiche d'un client. La CONSULTATION est journalisée.
create or replace function public.admin_subscriber_detail(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn_sub_detail$
declare
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', pc.user_id,
    'email', lower(au.email),
    'company_name', pc.company_name,
    'subscription_type', pc.subscription_type,
    'subscription_status', pc.subscription_status,
    'subscription_start', pc.subscription_start,
    'subscription_end', pc.subscription_end,
    'max_users', pc.max_users,
    'payment_method', pc.payment_method,
    'promo_code_used', pc.promo_code_used,
    'paddle_subscription_id', pc.paddle_subscription_id,
    'derniere_connexion', au.last_sign_in_at,
    'annonces_publiees', (select count(*) from public.machines m where m.sellerid = pc.user_id)
  ) into v
  from public.pro_clients pc
  join auth.users au on au.id = pc.user_id
  where pc.user_id = p_user_id;

  if v is null then
    raise exception 'Client introuvable.' using errcode = 'P0002';
  end if;

  -- Consulter une fiche est un acte tracé, au même titre que la modifier.
  perform public.log_admin_action(
    'client.consultation', coalesce(nullif(btrim(p_reason), ''), 'Consultation de fiche'),
    'user', p_user_id::text, '{}'::jsonb
  );

  return v;
end
$fn_sub_detail$;

grant execute on function public.admin_subscriber_detail(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Les quatre gestes de dépannage
-- ---------------------------------------------------------------------
-- Tous passent par le même contrôle et la même trace. Aucun ne touche à Paddle :
-- ils corrigent l'ACCÈS chez nous. Le prochain renouvellement Paddle écrasera un
-- prolongement fait ici — c'est pourquoi la fonction le signale dans sa réponse,
-- pour que l'écran puisse en avertir.

create or replace function public.admin_extend_subscription(
  p_user_id uuid,
  p_jours   integer,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn_extend$
declare
  v_avant timestamptz;
  v_apres timestamptz;
  v_paddle text;
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  if p_jours is null or p_jours <= 0 or p_jours > 365 then
    raise exception 'Durée invalide : entre 1 et 365 jours.' using errcode = '22023';
  end if;

  select pc.subscription_end, pc.paddle_subscription_id into v_avant, v_paddle
  from public.pro_clients pc where pc.user_id = p_user_id;
  if not found then
    raise exception 'Client introuvable.' using errcode = 'P0002';
  end if;

  -- On prolonge depuis l'échéance si elle est à venir, depuis aujourd'hui sinon :
  -- prolonger de 30 jours un abonnement expiré depuis 6 mois ne doit pas laisser
  -- une date encore dans le passé.
  v_apres := greatest(coalesce(v_avant, now()), now()) + (p_jours || ' days')::interval;

  update public.pro_clients
  set subscription_end = v_apres,
      subscription_status = 'active',
      updated_at = now()
  where user_id = p_user_id;

  perform public.log_admin_action(
    'abonnement.prolongation', p_reason, 'user', p_user_id::text,
    jsonb_build_object('jours', p_jours, 'avant', v_avant, 'apres', v_apres)
  );

  return jsonb_build_object(
    'ok', true,
    'nouvelle_echeance', v_apres,
    -- Avertissement remonté à l'écran : sans lui, l'administrateur croit avoir
    -- offert un mois alors que Paddle reprendra la main au renouvellement.
    'facture_par_paddle', v_paddle is not null
  );
end
$fn_extend$;

grant execute on function public.admin_extend_subscription(uuid, integer, text) to authenticated;

create or replace function public.admin_change_plan(
  p_user_id uuid,
  p_plan    text,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn_change_plan$
declare
  v_avant text;
  v_paddle text;
  v_plan text := lower(btrim(coalesce(p_plan, '')));
  v_sieges integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  -- 'entreprise' (variante historique) volontairement absente : on n'en crée plus.
  if v_plan not in ('pro', 'premium', 'enterprise') then
    raise exception 'Palier invalide.' using errcode = '22023';
  end if;

  select pc.subscription_type, pc.paddle_subscription_id into v_avant, v_paddle
  from public.pro_clients pc where pc.user_id = p_user_id;
  if not found then
    raise exception 'Client introuvable.' using errcode = 'P0002';
  end if;

  -- Les sièges suivent le palier, sinon un client rétrogradé garderait ses
  -- 5 utilisateurs — et le contrôle de sièges (p25) laisserait passer.
  v_sieges := case v_plan when 'enterprise' then 5 else 1 end;

  update public.pro_clients
  set subscription_type = v_plan, max_users = v_sieges, updated_at = now()
  where user_id = p_user_id;

  perform public.log_admin_action(
    'abonnement.changement_palier', p_reason, 'user', p_user_id::text,
    jsonb_build_object('avant', v_avant, 'apres', v_plan, 'sieges', v_sieges)
  );

  return jsonb_build_object('ok', true, 'palier', v_plan, 'sieges', v_sieges,
                            'facture_par_paddle', v_paddle is not null);
end
$fn_change_plan$;

grant execute on function public.admin_change_plan(uuid, text, text) to authenticated;

create or replace function public.admin_set_subscription_status(
  p_user_id uuid,
  p_statut  text,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn_set_status$
declare
  v_avant text;
  v_statut text := lower(btrim(coalesce(p_statut, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  -- Bornes du CHECK de la table : au-delà, l'écriture échouerait avec un message
  -- Postgres illisible pour l'utilisateur.
  if v_statut not in ('active', 'suspended', 'inactive') then
    raise exception 'Statut invalide (active, suspended ou inactive).' using errcode = '22023';
  end if;

  select pc.subscription_status into v_avant
  from public.pro_clients pc where pc.user_id = p_user_id;
  if not found then
    raise exception 'Client introuvable.' using errcode = 'P0002';
  end if;

  update public.pro_clients
  set subscription_status = v_statut, updated_at = now()
  where user_id = p_user_id;

  perform public.log_admin_action(
    case v_statut when 'suspended' then 'abonnement.suspension'
                  when 'active' then 'abonnement.reactivation'
                  else 'abonnement.desactivation' end,
    p_reason, 'user', p_user_id::text,
    jsonb_build_object('avant', v_avant, 'apres', v_statut)
  );

  return jsonb_build_object('ok', true, 'statut', v_statut);
end
$fn_set_status$;

grant execute on function public.admin_set_subscription_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Le journal, lisible par les administrateurs
-- ---------------------------------------------------------------------
-- Écrire est impossible (verrou p26) ; lire est réservé aux administrateurs.

create or replace function public.admin_recent_actions(p_limite integer default 50)
returns table (
  created_at  timestamptz,
  acteur      text,
  action      text,
  target_type text,
  target_id   text,
  reason      text,
  details     jsonb
)
language plpgsql
security definer
set search_path = public
as $fn_journal$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme.' using errcode = '42501';
  end if;
  return query
    select j.created_at, lower(au.email), j.action, j.target_type, j.target_id, j.reason, j.details
    from public.platform_admin_audit j
    join auth.users au on au.id = j.actor_id
    order by j.created_at desc
    limit least(coalesce(p_limite, 50), 200);
end
$fn_journal$;

grant execute on function public.admin_recent_actions(integer) to authenticated;
