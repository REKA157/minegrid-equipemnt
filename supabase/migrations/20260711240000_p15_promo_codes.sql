-- =====================================================================
-- P15 — Codes promo SÉCURISÉS (remplace le code promo côté client troué)
-- =====================================================================
-- AVANT : le front comparait un code lisible dans le bundle (VITE_PROMO_CODE) puis
-- écrivait lui-même pro_clients='active' -> code public + activation falsifiable +
-- sans limite = abonnement entreprise gratuit pour tous.
--
-- APRÈS : les codes vivent CÔTÉ SERVEUR (table promo_codes, AUCUN accès client ->
-- pas d'énumération). Le client ne peut que SOUMETTRE un code via la RPC
-- redeem_promo_code() (SECURITY DEFINER) qui valide (actif, non expiré, quota non
-- atteint, pas déjà utilisé par ce compte) et active l'abonnement en tant que
-- serveur (contourne le verrou p14, exactement comme le webhook Stripe). Limité :
-- max_uses, expires_at, un usage par utilisateur (unique).
-- Statements directs + délimiteur $fn$. Idempotent.
-- =====================================================================

create table if not exists public.promo_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  subscription_type text not null default 'enterprise',
  duration_days     int  not null default 30,
  max_uses          int  not null default 1,
  uses_count        int  not null default 0,
  expires_at        timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
-- Unicité insensible à la casse.
create unique index if not exists promo_codes_code_key on public.promo_codes (lower(code));

create table if not exists public.promo_redemptions (
  id             uuid primary key default gen_random_uuid(),
  promo_code_id  uuid not null references public.promo_codes(id) on delete cascade,
  user_id        uuid not null,
  redeemed_at    timestamptz not null default now(),
  unique (promo_code_id, user_id)   -- un même compte ne redéem pas 2× le même code
);

-- Aucun accès client direct : tout passe par la RPC.
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_codes from anon, authenticated;
revoke all on public.promo_redemptions from anon, authenticated;

-- RPC de rédemption : valide + active (SECURITY DEFINER = écrit pro_clients malgré p14).
create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_days int;
  v_type text;
  v_end  date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  -- IMPORTANT : aucun « SELECT ... INTO » — l'éditeur SQL Supabase le confond avec un
  -- SELECT INTO <table> (« relation v_promo does not exist »). On n'utilise que des
  -- affectations par sous-requête scalaire (:=) et RETURNING ... INTO.
  -- 1) Résoudre le code (actif + non expiré).
  v_id := (
    select id from public.promo_codes
    where lower(code) = lower(btrim(p_code))
      and active = true
      and (expires_at is null or expires_at > now())
    limit 1
  );
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Code promo invalide ou expiré');
  end if;

  -- 2) Réserver la rédemption D'ABORD : la contrainte unique (promo_code_id,user_id)
  --    garantit « un usage par compte » SANS toucher au compteur en cas de refus.
  begin
    insert into public.promo_redemptions (promo_code_id, user_id) values (v_id, v_uid);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Code déjà utilisé sur ce compte');
  end;

  -- 3) Consommer 1 usage de façon ATOMIQUE (échoue si quota atteint) + lire durée/type.
  update public.promo_codes
     set uses_count = uses_count + 1
   where id = v_id and uses_count < max_uses
   returning duration_days, subscription_type into v_days, v_type;
  if not found then
    -- quota épuisé (ou course perdue) : annuler la rédemption réservée, ne rien consommer.
    delete from public.promo_redemptions where promo_code_id = v_id and user_id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'Code promo épuisé');
  end if;

  -- 4) Activer l'abonnement (SECURITY DEFINER : écrit pro_clients malgré le verrou p14).
  v_end := (now() + make_interval(days => v_days))::date;
  insert into public.pro_clients (user_id, subscription_type, subscription_status,
                                  subscription_start, subscription_end, payment_method, updated_at)
  values (v_uid, v_type, 'active', now()::date, v_end, 'promo_code', now())
  on conflict (user_id) do update
    set subscription_type   = excluded.subscription_type,
        subscription_status = 'active',
        subscription_start  = excluded.subscription_start,
        subscription_end    = excluded.subscription_end,
        payment_method      = 'promo_code',
        updated_at          = now();

  return jsonb_build_object('ok', true, 'subscription_type', v_type, 'subscription_end', v_end);
end;
$fn$;

grant execute on function public.redeem_promo_code(text) to authenticated;

-- Pour créer un code (à faire par l'admin, jamais dans le front) :
--   insert into public.promo_codes (code, subscription_type, duration_days, max_uses, expires_at)
--   values ('MON-CODE-SECRET', 'enterprise', 30, 20, now() + interval '90 days');
