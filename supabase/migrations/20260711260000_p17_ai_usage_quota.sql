-- =====================================================================
-- P17 — Quota IA par société (anti-abus des crédits, audit Fable 5)
-- =====================================================================
-- FAILLE : l'Edge Function ai-proxy appelle le fournisseur LLM avec la clé de la
-- SOCIÉTÉ sans aucun quota -> un membre (ou un JWT volé) peut boucler des requêtes
-- et brûler le budget/les crédits IA de l'organisation (abus financier + DoS budget).
--
-- CORRECTIF : compteur quotidien par org + RPC atomique bump_ai_usage() appelée
-- par ai-proxy (service_role) AVANT chaque appel fournisseur. Au-delà du plafond,
-- l'appel est refusé (429). Table réservée au service_role (aucun accès client).
-- Statements directs + délimiteur $fn$. Idempotent.
-- =====================================================================

create table if not exists public.ai_usage_daily (
  organization_id uuid not null,
  usage_date      date not null default current_date,
  request_count   int  not null default 0,
  primary key (organization_id, usage_date)
);

alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from anon, authenticated;

-- Incrémente le compteur du jour et renvoie true si SOUS le plafond, false sinon.
-- Atomique (insert ... on conflict do update). SECURITY DEFINER : appelée par le
-- service_role de l'Edge Function.
create or replace function public.bump_ai_usage(p_org uuid, p_daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count int;
begin
  if p_org is null then
    return false;
  end if;

  insert into public.ai_usage_daily (organization_id, usage_date, request_count)
  values (p_org, current_date, 1)
  on conflict (organization_id, usage_date)
  do update set request_count = public.ai_usage_daily.request_count + 1
  returning request_count into v_count;

  return v_count <= greatest(1, p_daily_limit);
end;
$fn$;

-- Par défaut PostgreSQL accorde EXECUTE à PUBLIC : on le retire pour réserver la
-- fonction au service_role (l'Edge Function ai-proxy). Aucun client ne peut la
-- boucler pour gonfler le compteur d'une autre société.
revoke execute on function public.bump_ai_usage(uuid, int) from public;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;
