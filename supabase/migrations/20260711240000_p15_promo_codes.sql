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
  v_uid   uuid := auth.uid();
  v_promo public.promo_codes%rowtype;
  v_end   date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  -- Code valide ? (verrou de ligne pour éviter la course sur uses_count)
  select * into v_promo from public.promo_codes
  where lower(code) = lower(btrim(p_code))
    and active = true
    and (expires_at is null or expires_at > now())
    and uses_count < max_uses
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Code promo invalide, expiré ou épuisé');
  end if;

  if exists (select 1 from public.promo_redemptions r
             where r.promo_code_id = v_promo.id and r.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'Code déjà utilisé sur ce compte');
  end if;

  insert into public.promo_redemptions (promo_code_id, user_id) values (v_promo.id, v_uid);
  update public.promo_codes set uses_count = uses_count + 1 where id = v_promo.id;

  v_end := (now() + make_interval(days => v_promo.duration_days))::date;
  insert into public.pro_clients (user_id, subscription_type, subscription_status,
                                  subscription_start, subscription_end, payment_method, updated_at)
  values (v_uid, v_promo.subscription_type, 'active', now()::date, v_end, 'promo_code', now())
  on conflict (user_id) do update
    set subscription_type   = excluded.subscription_type,
        subscription_status = 'active',
        subscription_start  = excluded.subscription_start,
        subscription_end    = excluded.subscription_end,
        payment_method      = 'promo_code',
        updated_at          = now();

  return jsonb_build_object('ok', true, 'subscription_type', v_promo.subscription_type,
                            'subscription_end', v_end);
end;
$fn$;

grant execute on function public.redeem_promo_code(text) to authenticated;

-- Pour créer un code (à faire par l'admin, jamais dans le front) :
--   insert into public.promo_codes (code, subscription_type, duration_days, max_uses, expires_at)
--   values ('MON-CODE-SECRET', 'enterprise', 30, 20, now() + interval '90 days');
