-- =====================================================================
-- P14 — Verrouillage pro_clients : fin de l'abonnement gratuit auto-octroyé (P1 REVENUS)
-- =====================================================================
-- FAILLE (audit Fable 5, abus) : le front écrit DIRECTEMENT dans pro_clients
-- {subscription_status:'active'} via un code promo (VITE_PROMO_CODE, lisible dans
-- le bundle JS -> découvrable) — cf. Dashboard.jsx / Register.tsx. Le verrou RLS
-- qui l'empêche vit UNIQUEMENT dans sql/2026-06_pro_clients_rls_hardening.sql,
-- ABSENT des migrations trackées -> non appliqué en prod (comme tout le durcissement).
-- Conséquence : n'importe quel utilisateur (ou toute personne trouvant le code promo)
-- peut s'octroyer un abonnement pro/premium/enterprise GRATUIT.
--
-- CORRECTIF (port fidèle du hardening 2026-06) : la lecture reste au propriétaire ;
-- toute ÉCRITURE (activation d'abonnement) est réservée au service_role (webhook
-- Stripe, après vérif de signature). On révoque les grants d'écriture client.
--
-- Gardée (to_regclass) + délimiteur nommé pour le bundle/éditeur Supabase. Idempotent.
-- NB : ceci CASSE volontairement le chemin promo côté client (la faille). Un code
-- promo légitime doit être re-validé CÔTÉ SERVEUR (edge function + table promo_codes)
-- qui active via service_role — voir .audit/REMAINING_WORK.md.
-- =====================================================================

do $p14$
begin
  if to_regclass('public.pro_clients') is null then
    raise notice 'pro_clients absente : p14 ignorée'; return;
  end if;

  alter table public.pro_clients enable row level security;

  -- Retirer toutes les policies d'écriture cliente connues.
  drop policy if exists "Users can insert their own pro profile" on public.pro_clients;
  drop policy if exists "Users can update their own pro profile" on public.pro_clients;
  drop policy if exists "pro_clients_insert_own" on public.pro_clients;
  drop policy if exists "pro_clients_update_own" on public.pro_clients;

  -- Lecture : le propriétaire voit son propre abonnement (recréée proprement).
  drop policy if exists "Users can view their own pro profile" on public.pro_clients;
  drop policy if exists "pro_clients_select_own" on public.pro_clients;
  create policy "pro_clients_select_own" on public.pro_clients
    for select to authenticated using (auth.uid() = user_id);

  -- Écritures réservées au service_role : on révoque tout droit d'écriture client.
  revoke insert, update, delete on public.pro_clients from anon;
  revoke insert, update, delete on public.pro_clients from authenticated;
end;
$p14$;
