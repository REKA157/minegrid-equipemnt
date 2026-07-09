-- =====================================================================
-- IA — Connexion du compte IA de la société (OpenAI / Claude / Grok / autre).
--
-- La clé API est un SECRET : elle est stockée côté serveur, au niveau de
-- l'ORGANISATION (toute l'équipe partage la connexion), et n'est JAMAIS
-- renvoyée au navigateur. Le client passe uniquement par des fonctions :
--   - set_org_ai_key   : un admin définit / met à jour la clé (upsert) ;
--   - get_org_ai_status: statut MASQUÉ (fournisseur, modèle, 4 derniers
--                        caractères de la clé) — jamais la clé complète ;
--   - clear_org_ai_key : un admin déconnecte (supprime la clé).
--
-- SÉCURITÉ :
--   - RLS activée + AUCUN accès direct (revoke) : impossible de lire/écrire
--     la table sans passer par les fonctions SECURITY DEFINER ;
--   - définir/supprimer réservé aux owner/admin de la société ;
--   - le statut est visible par tout membre, mais la clé jamais exposée ;
--   - search_path=public verrouillé.
-- (La lecture de la clé complète se fait UNIQUEMENT côté serveur — service_role
--  — par la future fonction de proxy IA. Cf. étape 2.)
-- Idempotente.
-- =====================================================================

create table if not exists public.organization_ai_credentials (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('openai', 'anthropic', 'xai', 'custom')),
  api_key         text not null,
  model           text,
  base_url        text,
  configured_by   uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.organization_ai_credentials enable row level security;

-- Aucun accès direct : tout passe par les fonctions ci-dessous.
revoke all on public.organization_ai_credentials from authenticated;
revoke all on public.organization_ai_credentials from anon;
revoke all on public.organization_ai_credentials from public;

-- ---------- set_org_ai_key : un admin connecte / met à jour la clé ----------
create or replace function public.set_org_ai_key(
  p_provider text,
  p_api_key  text,
  p_model    text default null,
  p_base_url text default null
)
returns table (organization_id uuid, provider text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_provider text := lower(trim(p_provider));
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;
  if v_provider not in ('openai', 'anthropic', 'xai', 'custom') then
    raise exception 'Fournisseur non supporté.' using errcode = '22023';
  end if;
  if p_api_key is null or length(trim(p_api_key)) < 8 then
    raise exception 'Clé API invalide.' using errcode = '22023';
  end if;

  -- Société où l'appelant est owner/admin (priorité owner).
  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_uid and m.role in ('owner', 'admin')
  order by (m.role = 'owner') desc
  limit 1;

  if v_org is null then
    raise exception 'Seul un administrateur de la société peut connecter l''IA.' using errcode = '42501';
  end if;

  insert into public.organization_ai_credentials
    (organization_id, provider, api_key, model, base_url, configured_by, updated_at)
  values
    (v_org, v_provider, trim(p_api_key), nullif(trim(p_model), ''), nullif(trim(p_base_url), ''), v_uid, now())
  on conflict (organization_id) do update
    set provider = excluded.provider,
        api_key = excluded.api_key,
        model = excluded.model,
        base_url = excluded.base_url,
        configured_by = excluded.configured_by,
        updated_at = now();

  return query select v_org, v_provider;
end;
$$;

grant execute on function public.set_org_ai_key(text, text, text, text) to authenticated;

-- ---------- get_org_ai_status : statut MASQUÉ (jamais la clé) ----------
create or replace function public.get_org_ai_status()
returns table (
  configured  boolean,
  provider    text,
  model       text,
  key_last4   text,
  base_url    text,
  updated_at  timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    true,
    c.provider,
    c.model,
    -- On n'expose QUE les 4 derniers caractères de la clé.
    right(c.api_key, 4),
    c.base_url,
    c.updated_at
  from public.organization_ai_credentials c
  join public.organization_members me
    on me.organization_id = c.organization_id
   and me.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.get_org_ai_status() to authenticated;

-- ---------- clear_org_ai_key : un admin déconnecte ----------
create or replace function public.clear_org_ai_key()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;
  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_uid and m.role in ('owner', 'admin')
  order by (m.role = 'owner') desc
  limit 1;
  if v_org is null then
    raise exception 'Seul un administrateur peut déconnecter l''IA.' using errcode = '42501';
  end if;

  delete from public.organization_ai_credentials where organization_id = v_org;
  return true;
end;
$$;

grant execute on function public.clear_org_ai_key() to authenticated;
