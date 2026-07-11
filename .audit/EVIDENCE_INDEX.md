# EVIDENCE_INDEX

| ID | Phase | Sujet | Fichier | Commit | Validité |
|---|---|---|---|---|---|
| EV-P0-001 | 0 | Baseline Git + inventaire dépôt | `evidence/phase0_baseline.md` | f4fa30f5 | valide tant que commit/migrations/CI inchangés |
| EV-P12-001 | 1+2 | Pipeline qualité + 11/11 RLS versionnés | `evidence/phase1_2_pipeline_rls.md` | f4fa30f5 | invalidé si migration change |
| EV-PROD-001 | 2 | Vérif RLS PROD (34 tables) : RLS active partout, hardening p2..p11 ABSENT | `evidence/prod_rls_verification.sql` (lancé par l'utilisateur) | prod 2026-07-11 | re-lancer après application du bundle |
| EV-APPLY-001 | 8 | Bundle correctifs prod (idempotent/gardé, validé prod-like exit 0) | `APPLY_IN_PROD.sql` | HEAD | À appliquer ; re-valider par prod_rls_verification.sql |

> Chaque nouvelle preuve DOIT être ajoutée ici avec son commit et ses conditions d'invalidation (section 29 du protocole).
> Une preuve obtenue sur un ancien commit ne vaut pas pour le commit courant.
