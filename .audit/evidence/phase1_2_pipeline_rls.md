# PREUVE — Phase 1 (qualité) + Phase 2 (RLS locale)

ID : EV-P1-001 / EV-P2-001
DATE : 2026-07-11 · COMMIT : f4fa30f5 · ENV : local (Docker Postgres 16)

## Phase 1 — pipeline qualité (sorties réelles)
- `npx tsc --noEmit` → **exit 0** (0 erreur type)
- `npm run lint` → **exit 0**, 0 erreur, **887 warnings** (majorité `no-unused-vars` → code mort / P3)
- `npm test` (vitest) → **381 tests / 65 fichiers, 381 passed, exit 0**
- `npm run build` → **exit 0** (warning chunks > 600 kB → P2 perf, pas de code-splitting sur gros vendors ex. exceljs ~940 kB)

CONCLUSION P1 : base saine (types/tests/build verts). Aucun blocant. À traiter : P2 bundle, P3 warnings.

## Phase 2 — RLS versionnée prouvée en local (11/11)
Rejeu de chaque harnais `prereq + migration + countercases` sur schéma neuf (drop/recreate),
`psql -v ON_ERROR_STOP=1`, `auth.uid()` stubbé (GUC), rôles `anon`/`authenticated`, ≥2 entreprises :

| Harnais | Résultat |
|---|---|
| p7_trust_recompute | OK |
| teamA_pipeline (leads) | OK |
| teamB_members | OK |
| teamC_invitations | OK |
| teamD_subscription | OK |
| teamE_ai_credentials | OK |
| teamF_scopes | OK |
| teamG_vitrines | OK |
| teamG_documents | OK |
| teamH_sessions | OK |
| teamI_planning_devis | OK |

**Bilan : 11 OK / 0 FAIL.** Isolation inter-sociétés, anti-usurpation d'owner, refus cross-org sur RPC,
search_path verrouillé — tous prouvés pour le SQL VERSIONNÉ.

## LIMITE MAJEURE (risque résiduel P1)
Les migrations versionnées ne couvrent que : machines, leads, transaction_cases (update/lock),
payment_records (lock), return-rail, trust, et org/team (A→J). Les tables **escrow, finance, inspection,
chaîne transaction (participants/documents/messages/tasks), métiers (courtier/logisticien/transitaire…),
customs, logistics, market** ont leur RLS définie **uniquement dans `sql/` manuel** — non versionnée,
sans contre-cas, application prod non vérifiable ici. → instruit par le workflow RLS-coverage.

ÉLÉMENTS INVALIDANTS : changement de migration/commit.
