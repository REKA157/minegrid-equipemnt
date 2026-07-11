-- =====================================================================
-- P9 — Verrouillage du scoring finance_applications (P1 : auto-scoring) — LATENT
-- =====================================================================
-- FAILLE (audit Fable 5, cluster finance) : la policy RLS d'UPDATE
-- (finance_apps_update_own_draft, sql/nextgen/0002) autorise le demandeur à
-- modifier N'IMPORTE QUELLE colonne tant que status ∈ (draft,submitted), dont
-- `score` et `partner_id` (colonnes SERVEUR) -> auto-scoring / choix de partenaire.
--
-- ÉTAT PROD (prod_rls_verification.sql, 2026-07-11) : la table finance_applications
-- N'EXISTE PAS en prod (couche finance nextgen non déployée — cf. absente du tableau
-- de vérif ; seule financing_requests, la variante transaction_platform, est là).
-- Cette migration est donc LATENTE : elle ne mord qu'au déploiement de la finance.
--
-- Pour être SÛRE à appliquer maintenant (no-op si table absente) ET correcte plus
-- tard, on garde par to_regclass. Délimiteur nommé $guard$ (pas de $$ ambigu,
-- aucun SELECT INTO) pour compat éditeur Supabase. Idempotent.
--
-- CORRECTIF : privilèges de COLONNE — UPDATE client limité aux colonnes non
-- sensibles ; score/partner_id réservés au service_role.
-- =====================================================================

do $guard$
begin
  if to_regclass('public.finance_applications') is null then
    raise notice 'finance_applications absente : migration p9 ignorée (couche finance non déployée)';
    return;
  end if;

  alter table public.finance_applications enable row level security;

  -- Retirer l'UPDATE « toutes colonnes » au client…
  revoke update on public.finance_applications from authenticated;
  revoke update on public.finance_applications from anon;

  -- …puis n'accorder l'UPDATE que sur les colonnes CLIENT (jamais score/partner_id).
  grant update (amount, currency, term_months, machine_id, dossier, status, updated_at)
    on public.finance_applications to authenticated;
end;
$guard$;
