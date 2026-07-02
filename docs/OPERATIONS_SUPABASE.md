# Exploitation Supabase — MineGrid Équipement

> Objectif : rendre le déploiement de la base **traçable, reproductible et
> récupérable**. La cause n°1 des régressions passées (dérive RLS, escrow cassé)
> était l'application manuelle de scripts SQL non versionnés. Ce document fixe les
> règles d'exploitation.

## 0. Règle d'or

- ❌ **Ne plus exécuter de SQL à la main dans le SQL Editor** pour un changement
  permanent (schéma / RLS / RPC). Le SQL Editor est réservé au **diagnostic en
  lecture** ou à un **dépannage exceptionnel tracé** (voir §4).
- ✅ Tout changement passe par un **fichier versionné** dans `supabase/migrations/`,
  revu en PR, appliqué par `supabase db push`. Voir `supabase/migrations/README.md`.

## 1. Environnements

| Env | Usage | Données |
|---|---|---|
| **prod** | `Minegrid-Equipement` (projet Supabase actuel) | données réelles |
| **staging** (à créer — action manuelle) | tests de migration + seeds démo | jetables |

> ⚠️ **Action manuelle requise (Supabase)** : créer un 2e projet Supabase « staging »
> et y appliquer les migrations AVANT prod. Aujourd'hui il n'existe qu'un seul projet ;
> les scripts de seed/test (`sql/*_test*.sql`, `seed_*.sql`) ne doivent PLUS viser la prod.

## 2. Sauvegardes / PITR

> ⚠️ **Action manuelle requise (Supabase Dashboard)** — non activable depuis le code :
> - **PITR (Point-In-Time Recovery)** : `Dashboard → Database → Backups → Point in Time`.
>   Nécessite le plan **Pro** (ou +). Recommandé : rétention **7 jours** minimum.
> - À défaut de PITR : les **daily backups** du plan Free existent mais sont limités —
>   compléter par un `pg_dump` hebdomadaire hors-plateforme (voir ci-dessous).

Export manuel hors-plateforme (à planifier, ex. cron sur un VPS ou une machine sûre) :

```bash
# Nécessite la connection string (Dashboard → Settings → Database).
# Ne JAMAIS committer cette URL ni la clé service_role.
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -Fc -f "minegrid_$(date +%F).dump"
```

Restauration (staging d'abord, jamais tester la restore sur la prod) :

```bash
pg_restore --clean --no-owner --no-privileges -d "$STAGING_DB_URL" minegrid_YYYY-MM-DD.dump
```

## 3. Ordre d'application des migrations

Source de vérité : **`supabase/migrations/`** (voir son README pour l'ordre détaillé).
Résumé des deltas correctifs P2–P5 (juillet 2026) :

1. `..._p2_consolidate_critical_functions.sql` — fonctions canoniques.
2. `..._p3_rls_machines_owner.sql` — RLS machines.
3. `..._p3_rls_loueur_tenant_isolation.sql` — isolation loueur.
4. `..._p3_lock_payment_records.sql` — verrou paiements.
5. `..._p3_restrict_transaction_cases_update.sql` — verrou colonnes dossier.
6. `..._p5_return_rail_transitions.sql` — transitions terminales.

Toutes **idempotentes** : ré-applicables sans risque sur la prod actuelle.

```bash
supabase link --project-ref <PROJECT_REF>   # une fois
supabase db push                            # applique les migrations en attente
```

> **Baseline (dette connue)** : les tables de base vivent encore dans `sql/` (déjà
> appliquées en prod). Pour qu'un `supabase db push` reconstruise une base **neuve**,
> il reste à importer cette baseline en `0000_baseline.sql` (chantier séparé).

## 4. Checklist de déploiement (à chaque release schéma)

1. [ ] `npm run build` + `npm test` + `npm run lint` **verts** en local et en CI.
2. [ ] Revue PR de chaque migration (`supabase/migrations/`).
3. [ ] Appliquer sur **staging** : `supabase db push` → vérifier l'appli (smoke test).
4. [ ] Vérifier les RLS critiques sur staging (voir §6).
5. [ ] **Snapshot/PITR prod** confirmé actif AVANT push prod.
6. [ ] `supabase db push` sur prod.
7. [ ] Smoke test prod : publier une annonce, créer un devis→dossier, ouvrir une étape.
8. [ ] Consigner date + hash de commit appliqué.

## 5. Plan de rollback

- **Migration idempotente fautive** : corriger en **nouvelle** migration `..._fix.sql`
  (forward-fix) — ne jamais éditer une migration déjà appliquée.
- **Incident données** : restaurer via **PITR** au timestamp juste avant l'incident
  (Dashboard → Backups → Restore) — d'abord valider la fenêtre sur staging si possible.
- **RLS trop restrictive après coup** : chaque migration P3 est réversible par une
  migration inverse (ex. recréer une policy). Garder le diff `pg_policies` avant/après.

## 6. Vérifications RLS (à lancer en lecture dans le SQL Editor)

```sql
-- machines : plus de USING(true), UPDATE/DELETE réservés au propriétaire
select policyname, cmd, qual from pg_policies where tablename='machines';

-- loueur : SELECT scoping created_by (aucun 'auth.role() = authenticated' résiduel)
select tablename, policyname, qual from pg_policies
where tablename in ('rentals','interventions','rental_invoices') and cmd='SELECT';

-- payment_records : aucune écriture pour 'authenticated'
select grantee, privilege_type from information_schema.role_table_grants
where table_name='payment_records' and grantee='authenticated';

-- transaction_cases : UPDATE colonne restreint à title/notes/priority
select grantee, privilege_type, column_name from information_schema.column_privileges
where table_name='transaction_cases' and grantee='authenticated' and privilege_type='UPDATE';
```

## 7. Secrets (rappel sécurité)

- Ne **jamais** committer `.env`, la connection string DB, ni la clé `service_role`.
- Aucun secret dans une variable `VITE_*` (inlinée dans le bundle public).
- Les webhooks (Stripe, escrow PSP) valident une **signature** côté serveur — ne pas
  contourner.

## 8. Points nécessitant une action manuelle (récapitulatif)

- [ ] **PITR / backups** : activer dans le Dashboard Supabase (plan Pro).
- [ ] **Projet staging** : créer + y router seeds/tests.
- [ ] **Supabase CLI** : `supabase link` puis `supabase db push` (remplace le SQL Editor).
- [ ] **PSP escrow** : contractualiser un prestataire + implémenter l'edge function
      `create-escrow` et brancher `escrow-webhook` (tant que ce n'est pas fait,
      l'UI affiche « séquestre en préparation » — aucun argent ne transite).
