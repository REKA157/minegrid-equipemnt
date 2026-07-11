# PRODUCTION_READINESS

**DÉCISION : GO SOUS CONDITIONS** (au 2026-07-11).

## Ce qui est fait (prouvé + committé)
- Phases 0,1,2,4 + chaîne d'appro exécutées. Pipeline vert (tsc/lint/vitest 381/build).
- **11/11 harnais RLS versionnés** rejoués (Docker).
- **2 P0 fermés en prod** : commission_records (p8), payment_records (p11).
- **P1 fraude fermé en prod** : inspection_reports (p10, le vendeur ne peut plus écrire son rapport).
- Découverte majeure : le durcissement `supabase/migrations/` (p2..p13) n'était PAS en prod ; la RLS
  de base y est active. Un **bundle unique** `.audit/APPLY_IN_PROD.sql` regroupe tous les verrous restants.

## CONDITIONS avant GO plein
1. **Appliquer `.audit/APPLY_IN_PROD.sql`** en prod (transaction_cases, audit_logs, stripe idempotency
   + ré-affirmation commission/payment/inspection). Puis re-lancer `evidence/prod_rls_verification.sql`
   et vérifier `ecritures_client = NULL` sur les tables argent.
2. **Redéployer les Edge Functions** durcies : `stripe-webhook` (dédup event.id + réconciliation montant),
   `escrow-webhook` (UPDATE conditionnel anti-TOCTOU) — et les **tester en staging** (non runtime-prouvables ici).
3. **Avant d'armer l'escrow PSP** : traiter F-012 (réconciliation montant/devise PSP, contrat webhook) et
   F-013 (release_conditions appliquées côté serveur). Décision produit + staging.
4. **Dette de versionnement (F-002)** : porter la baseline `sql/` + le durcissement en `0000_baseline`
   versionné, pour qu'un environnement reconstruit soit sûr (sinon risque en DR / nouvel env).
5. **Décision schéma** F-004 (collisions inspection_requests/customs_cases/transport_requests).

## NON VÉRIFIÉ (hors périmètre local) — risque résiduel
- Phase 3 (E2E paiement/escrow réels), Phase 5 (charge 100/300/500), tests multi-appareils/a11y :
  à exécuter sur staging avec secrets. Aucun accès prod/charge ici.

## Capacité
```
CAPACITÉ PROUVÉE : isolation RLS (Docker, 11+7 harnais) ; intégrité des écritures argent (verrous prouvés).
CAPACITÉ NON PROUVÉE : montée en charge, E2E paiement de bout en bout, résilience pannes externes.
LIMITES ENVIRONNEMENT : pas d'accès prod/staging/charge ; secrets absents.
```
