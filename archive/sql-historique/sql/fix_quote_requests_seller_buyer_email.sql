-- =====================================================================
-- Corrige seller_id sur les demandes de devis envoyées par un acheteur
-- donné : reprend le titulaire actuel depuis public.machines (après
-- réattribution vendeur, ex. reassign_machines_seller_by_email.sql).
--
-- Cible : buyer_email = t.ainour@ads-idf.fr (insensible à la casse).
-- =====================================================================

-- Prévisualisation
select
  qr.id,
  qr.machine_id,
  qr.machine_name,
  qr.buyer_email,
  qr.seller_id as seller_id_actuel,
  coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) as seller_id_machine,
  u.email as email_vendeur_auth
from public.quote_requests qr
join public.machines m on m.id = qr.machine_id
left join auth.users u on u.id = coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)
where lower(trim(qr.buyer_email)) = lower(trim('t.ainour@ads-idf.fr'))
order by qr.created_at desc;

-- Mise à jour : aligner seller_id sur la machine (titulaire résolu)
update public.quote_requests qr
set
  seller_id = coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id),
  updated_at = now()
from public.machines m
where qr.machine_id = m.id
  and lower(trim(qr.buyer_email)) = lower(trim('t.ainour@ads-idf.fr'))
  and coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) is not null
  and coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) not in (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  )
  and (
    qr.seller_id is distinct from coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)
    or qr.seller_id is null
  );

-- Contrôle après coup
select id, machine_name, buyer_email, seller_id, updated_at
from public.quote_requests
where lower(trim(buyer_email)) = lower(trim('t.ainour@ads-idf.fr'))
order by created_at desc;
