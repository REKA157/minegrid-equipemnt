# AUDIT_CONTRACT — MineGrid (protocole Fable 5)

## Objet
Déterminer, **preuves reproductibles à l'appui**, si MineGrid peut passer en production
pour plusieurs centaines d'utilisateurs et plusieurs entreprises concurrentes.
Conclusion attendue : **GO / GO SOUS CONDITIONS / NO-GO**.

## Portée
- Frontend SPA (React/Vite/TS), Edge Functions Supabase (Deno), schéma PostgreSQL + RLS.
- Service externe `monitor-service` (FastAPI) analysé côté intégration uniquement (hors de ce repo).

## Règles absolues (rappel)
1. **Ne pas corriger pendant l'inventaire** (phases 0 → 6 = constat). Corrections en phase 8 seulement.
2. **Ne jamais masquer une erreur** (pas de test désactivé, try/catch vide, `any` masquant, mock à la place de données réelles).
3. **Toute conclusion a une preuve** (commande+sortie, test, SQL+résultat, 2 utilisateurs/2 entreprises, trace runtime).
4. **`service_role` n'est jamais une preuve de sécurité RLS** — tester `anon` + `authenticated`, ≥2 entreprises.
5. **Aucune charge agressive contre la production.**
6. **Ne jamais afficher un secret** (nom/emplacement/exposition oui ; valeur non).

## Contraintes d'environnement (spécifiques à cette mission)
- **LOCAL ONLY** — le remote GitHub est **public**, aucun `git push`.
- **Aucun accès prod/staging Supabase** : la RLS est prouvée sur **Docker Postgres jetable** à partir du
  SQL du dépôt. La **parité avec la prod n'est pas vérifiable** ici → risque résiduel documenté.
- Secrets non fournis : parcours réels paiement/escrow non exécutables de bout en bout.

## Classification
- **P0** critique (fuite inter-entreprises, contournement admin, prise de contrôle compte, `service_role` exposé,
  falsification paiement, libération escrow frauduleuse, corruption de données).
- **P1** élevé (parcours principal cassé, RLS incomplète, doublons, non-atomicité, build/migration non fiable).
- **P2** moyen · **P3** faible.

## Livrables
`.audit/AUDIT_STATE.json` (vérité de reprise) · `COVERAGE_MATRIX.md` · `FINDINGS.md` · `EVIDENCE_INDEX.md`
· `PAGE_ELEMENT_AUDIT.md` · `PRODUCTION_READINESS.md` · `PROGRESS_LOG.md` · `evidence/`.

## Mode d'exécution retenu
Section 33 du protocole : **produire la Phase 0 puis s'arrêter** (checkpoint). Les phases suivantes
sont lancées sur décision explicite de l'utilisateur (qui reste dans la boucle).
