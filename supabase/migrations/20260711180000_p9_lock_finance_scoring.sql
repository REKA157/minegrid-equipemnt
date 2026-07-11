-- =====================================================================
-- P9 — Verrouillage du scoring finance_applications (P1 : auto-scoring)
-- =====================================================================
-- FAILLE (audit Fable 5, cluster finance) : la policy RLS d'UPDATE
-- (finance_apps_update_own_draft, sql/nextgen/0002) autorise le demandeur à
-- modifier N'IMPORTE QUELLE colonne tant que status ∈ (draft,submitted). Or
-- `score` et `partner_id` sont documentés « écrits par le moteur de scoring /
-- la transmission partenaire côté serveur ». Un demandeur pouvait donc
-- s'auto-attribuer score=100 ou choisir son partner_id (empoisonnement du
-- scoring / éligibilité).
--
-- CORRECTIF : restreindre l'UPDATE CLIENT aux SEULES colonnes non sensibles via
-- les privilèges de COLONNE Postgres. score/partner_id ne sont plus écrivables
-- que par le service_role (moteur serveur). La RLS (ligne + status) reste.
--
-- Statements directs, idempotent. Pré-requis : table finance_applications
-- existe déjà (baseline sql/nextgen/0002).
-- =====================================================================

alter table public.finance_applications enable row level security;

-- Retirer l'UPDATE « toutes colonnes » au rôle authenticated…
revoke update on public.finance_applications from authenticated;
revoke update on public.finance_applications from anon;

-- …puis n'accorder l'UPDATE que sur les colonnes CLIENT (jamais score/partner_id).
grant update (amount, currency, term_months, machine_id, dossier, status, updated_at)
  on public.finance_applications to authenticated;
