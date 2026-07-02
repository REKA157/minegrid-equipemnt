# Migrations Supabase — source de vérité SQL

> **Règle n°1 : tout changement de schéma/RLS/RPC passe désormais par un fichier
> versionné DANS CE DOSSIER, appliqué par `supabase db push`.**
> On n'applique plus de script à la main dans le SQL Editor (sauf dépannage tracé),
> et on ne ré-exécute plus les scripts historiques de `sql/`.

## Contexte

Historiquement, le schéma vivait dans ~50 scripts `sql/*.sql` + `SQL_A_APPLIQUER/`
appliqués manuellement. Plusieurs définitions **concurrentes** du même objet ont
provoqué des dérives (RLS, escrow). Ces scripts constituent la **baseline déjà
appliquée en prod** ; ils sont conservés pour l'historique mais **ne doivent plus
être ré-exécutés**. Les deltas correctifs vivent ici, ordonnés.

## Ordre d'application (deltas P2–P5)

| Ordre | Fichier | Rôle |
|---|---|---|
| 1 | `20260702090000_p2_consolidate_critical_functions.sql` | **P2** — versions CANONIQUES de `can_access_transaction_case` (org-aware) et `ensure_transaction_case_for_quote_request` (avec `total_amount`). |
| 2 | `20260702090100_p3_rls_machines_owner.sql` | **P3** — RLS `machines` : SELECT public, INSERT authentifié (owner forcé par trigger), UPDATE/DELETE propriétaire seul. |
| 3 | `20260702090200_p3_rls_loueur_tenant_isolation.sql` | **P3** — SELECT `rentals`/`interventions`/`rental_invoices` restreint à `created_by = auth.uid()` (fin de la fuite inter-clients). |
| 4 | `20260702090300_p3_lock_payment_records.sql` | **P3** — `payment_records` : écriture réservée au serveur (pont escrow), lecture participants. |
| 5 | `20260702090400_p3_restrict_transaction_cases_update.sql` | **P3** — UPDATE `transaction_cases` : colonnes sensibles verrouillées (RPC only), UPDATE direct limité à title/notes/priority pour les principaux. |
| 6 | `20260702091000_p5_return_rail_transitions.sql` | **P5** — RPC de transitions terminales (inspection/transport/douane/clôture) + événements + escrow logique sans PSP. |

> Toutes les migrations sont **idempotentes** (`CREATE OR REPLACE`,
> `DROP POLICY IF EXISTS`, `ADD COLUMN IF NOT EXISTS`) : sûres à ré-appliquer sur la
> prod actuelle.

## Objets CANONIQUES (une seule source par objet)

| Objet | Fichier canonique | Ancienne version neutralisée |
|---|---|---|
| `can_access_transaction_case` | `20260702090000_p2_...` (org-aware) | inline `sql/transaction_platform_core.sql` (v1, upgradée par extended puis par cette migration) |
| `ensure_transaction_case_for_quote_request` | `20260702090000_p2_...` + `sql/rpc_ensure_transaction_case_for_quote_request.sql` | `sql/transaction_platform_links_and_triggers.sql` → renommée `__superseded` |
| Pont escrow | `sql/2026-06_escrow_bridge.sql` | `SQL_A_APPLIQUER/7_pont_escrow.sql` → marqué DEPRECATED |

## Comment appliquer

```bash
# depuis la racine du repo, avec la Supabase CLI liée au projet
supabase db push
```

En dépannage (sans CLI) : ouvrir chaque fichier ci-dessus **dans l'ordre** dans le
SQL Editor Supabase et l'exécuter. Consigner l'exécution (date + fichier) — voir
`docs/OPERATIONS_SUPABASE.md`.

## Reste à faire (dette connue, hors périmètre P2)

- Importer la **baseline complète** (`sql/` historiques) en migration numérotée `0000_baseline`
  pour qu'un `supabase db push` reconstruise une base neuve de zéro.
- Résoudre la collision de schéma `inspection_requests`/`inspection_reports`
  (`sql/nextgen/0001` vs `sql/transaction_platform_extended.sql`).
