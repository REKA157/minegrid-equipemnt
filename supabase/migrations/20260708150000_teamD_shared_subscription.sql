-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 5 : abonnement PARTAGÉ (« le propriétaire paie,
-- l'équipe hérite »).
--
-- Aujourd'hui l'abonnement est lu par utilisateur dans pro_clients (RLS SELECT
-- propriétaire). Un membre invité n'a pas de ligne pro_clients -> aucun accès.
--
-- get_effective_subscription() renvoie le MEILLEUR abonnement ACTIF disponible
-- pour l'appelant : le sien OU celui du/des propriétaire(s) de ses sociétés.
--
-- SÉCURITÉ :
--  - SECURITY DEFINER : peut lire la ligne pro_clients du PROPRIÉTAIRE (que le
--    membre ne peut pas lire directement via la RLS) — mais n'expose que le
--    NIVEAU/STATUT/ÉCHÉANCE du forfait, pas de données sensibles ;
--  - STRICTEMENT scopée : uniquement les propriétaires des organisations dont
--    l'appelant est lui-même membre (pas d'héritage inter-société) ;
--  - is_active recalculé côté serveur (statut 'active' ET non expiré) : on ne
--    fait jamais confiance au client ;
--  - search_path=public verrouillé.
-- Idempotente.
-- =====================================================================

create or replace function public.get_effective_subscription()
returns table (
  is_active boolean,
  type      text,
  status    text,
  ends_at   timestamptz,
  source    text   -- 'self' (le sien) ou 'org' (hérité du propriétaire)
)
language sql
security definer
set search_path = public
stable
as $$
  with cand as (
    -- 1) Mon propre abonnement.
    select pc.subscription_type as type, pc.subscription_status as status,
           pc.subscription_end as ends_at, 'self'::text as source
    from public.pro_clients pc
    where pc.user_id = auth.uid()
    union all
    -- 2) L'abonnement du/des propriétaire(s) de MES organisations.
    select pc.subscription_type, pc.subscription_status, pc.subscription_end, 'org'::text
    from public.organization_members my
    join public.organization_members owner
      on owner.organization_id = my.organization_id and owner.role = 'owner'
    join public.pro_clients pc on pc.user_id = owner.user_id
    where my.user_id = auth.uid()
  ),
  scored as (
    select
      c.type, c.status, c.ends_at, c.source,
      (c.status = 'active' and (c.ends_at is null or c.ends_at > now())) as is_active,
      case c.type
        when 'enterprise' then 4 when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0
      end as rnk
    from cand c
  )
  -- Toujours exactement UNE ligne : le meilleur candidat ACTIF, sinon inactif.
  select coalesce(s.is_active, false), s.type, s.status, s.ends_at, s.source
  from (select 1) one
  left join lateral (
    select * from scored where is_active order by rnk desc, ends_at desc nulls last limit 1
  ) s on true;
$$;

grant execute on function public.get_effective_subscription() to authenticated;
