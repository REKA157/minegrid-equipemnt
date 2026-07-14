-- =====================================================================
-- P24 — Quota quotidien tenders-ai par utilisateur (anti-abus crédits API)
-- =====================================================================
-- FAILLE : l'Edge Function tenders-ai appelle l'API Claude (coûteuse) sans aucun
-- quota. Un utilisateur (ou un JWT volé) peut boucler des analyses/génération de
-- documents et brûler le crédit ANTHROPIC_API_KEY (abus financier + DoS budget).
--
-- CORRECTIF : compteur quotidien PAR UTILISATEUR + RPC atomique bump_tenders_usage()
-- que tenders-ai (service_role) appelle AVANT chaque appel modèle. Au-delà du plafond,
-- l'appel est refusé (429) et le front retombe sur son mode simulation. Table réservée
-- au service_role (aucun accès client). Même patron que p17 (ai-proxy). $fn$. Idempotent.
-- =====================================================================

create table if not exists public.tenders_ai_usage_daily (
  user_id       uuid not null,
  usage_date    date not null default current_date,
  request_count int  not null default 0,
  primary key (user_id, usage_date)
);

alter table public.tenders_ai_usage_daily enable row level security;
revoke all on public.tenders_ai_usage_daily from anon, authenticated;

-- Incrémente le compteur du jour, renvoie true si SOUS le plafond, false sinon.
create or replace function public.bump_tenders_usage(p_user uuid, p_daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count int;
begin
  if p_user is null then
    return false;
  end if;

  insert into public.tenders_ai_usage_daily (user_id, usage_date, request_count)
  values (p_user, current_date, 1)
  on conflict (user_id, usage_date)
  do update set request_count = public.tenders_ai_usage_daily.request_count + 1
  returning request_count into v_count;

  return v_count <= greatest(1, p_daily_limit);
end;
$fn$;

revoke execute on function public.bump_tenders_usage(uuid, int) from public;
grant execute on function public.bump_tenders_usage(uuid, int) to service_role;
