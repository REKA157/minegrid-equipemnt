-- ============================================================================
-- P7i - Source d'autorite unique pour l'entitlement (MG-M06)
-- ============================================================================
-- CONSTAT
--   `public.get_effective_subscription()` est la regle metier de reference :
--   elle couvre l'heritage d'organisation (un membre beneficie de l'abonnement
--   du proprietaire) ET l'expiration (`ends_at > now()`).
--
--   Le `monitor-service` ne l'utilise pas. Il interroge `pro_clients` en direct,
--   filtre sur `user_id = <appelant>` et teste `subscription_status in
--   (active, trialing, paid)`. Deux divergences reelles en resultent :
--
--     1. FAUX REFUS — un membre d'organisation dont le proprietaire paie n'a
--        aucune ligne `pro_clients` a son nom : il est refuse alors qu'il est
--        ayant droit. Un client paie et ses collaborateurs sont bloques.
--     2. FAUX ACCES — une ligne `status = 'active'` dont `subscription_end` est
--        depassee est acceptee, l'expiration n'etant jamais testee. Un
--        abonnement termine continue d'ouvrir l'acces payant.
--
--   Deux sources de verite sur la meme question donnent deux reponses. C'est la
--   cause, pas le symptome.
--
-- CORRECTIF
--   Une variante appelable par le service_role pour un utilisateur donne. La
--   logique reste ECRITE UNE SEULE FOIS : cette fonction delegue aux memes
--   regles, avec l'identifiant en parametre au lieu de `auth.uid()`.
-- ============================================================================

create or replace function public.get_effective_subscription_for(p_user_id uuid)
returns table(
  is_active boolean,
  subscription_type text,
  subscription_status text,
  ends_at timestamptz,
  source text
)
language sql
stable
security definer
set search_path = public
as $fn_eff_sub_for$
  with cand as (
    -- 1) Abonnement propre de l'utilisateur.
    select pc.subscription_type as type, pc.subscription_status as status,
           pc.subscription_end as ends_at, 'self'::text as source
      from public.pro_clients pc
     where pc.user_id = p_user_id
    union all
    -- 2) Abonnement du/des proprietaire(s) de SES organisations (heritage).
    select pc.subscription_type, pc.subscription_status, pc.subscription_end, 'org'::text
      from public.organization_members my
      join public.organization_members owner
        on owner.organization_id = my.organization_id and owner.role = 'owner'
      join public.pro_clients pc on pc.user_id = owner.user_id
     where my.user_id = p_user_id
  ),
  scored as (
    select
      c.type, c.status, c.ends_at, c.source,
      -- L'expiration est testee ici, et nulle part ailleurs.
      (c.status = 'active' and (c.ends_at is null or c.ends_at > now())) as is_active,
      case c.type
        when 'enterprise' then 4 when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0
      end as rnk
      from cand c
  )
  select coalesce(s.is_active, false), s.type, s.status, s.ends_at, s.source
    from (select 1) one
    left join lateral (
      select * from scored where is_active order by rnk desc, ends_at desc nulls last limit 1
    ) s on true;
$fn_eff_sub_for$;

-- Reserve au backend : un client ne doit pas pouvoir interroger l'abonnement
-- d'un autre utilisateur (il dispose de get_effective_subscription() pour le sien).
revoke all on function public.get_effective_subscription_for(uuid)
  from public, anon, authenticated;
grant execute on function public.get_effective_subscription_for(uuid) to service_role;

comment on function public.get_effective_subscription_for(uuid) is
  'Entitlement effectif d''un utilisateur donne : heritage organisation + expiration. Source unique partagee avec le monitor-service (MG-M06). service_role uniquement.';
