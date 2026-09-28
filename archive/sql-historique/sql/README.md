# Dossier `sql/` — scripts historiques, hors chaîne de migration

> **L'état de référence du schéma est `supabase/migrations/`** (baseline → p30).
> Les fichiers de ce dossier ne sont **pas** rejoués par la CLI Supabase, **pas**
> exécutés par la CI, et **pas** appelés par le code applicatif : les quelques
> mentions dans `src/` et dans les migrations sont des **commentaires**.

## Pourquoi cet avertissement (audit du 2026-08-14)

Plusieurs de ces scripts **annulent** des correctifs de sécurité déjà appliqués par
la chaîne de migration. Le cas le plus grave a été observé en production :
l'interface invitait l'utilisateur à déployer `transaction_platform_extended.sql`
pour contourner une panne — or ce script ré-accorde les écritures sur
`inspection_reports` et `audit_logs`, c'est-à-dire qu'il **réintroduit** les failles
fermées par `p10` (auto-certification du vendeur) et `p12` (falsification du
journal d'audit).

## Règles

1. **Ne jamais appliquer un fichier de ce dossier à la base de production.**
2. Tout changement de schéma passe par une **migration versionnée** dans
   `supabase/migrations/`, revue et accompagnée de contre-cas.
3. Trois scripts portent un **garde d'exécution** qui interrompt toute application
   accidentelle (`SCRIPT NEUTRALISE`) — ils sont conservés pour l'historique :
   - `transaction_platform_extended.sql`
   - `transaction_platform_core.sql`
   - `patch_transaction_participants_insert_buyer.sql`
4. Les autres fichiers **n'ont volontairement pas de garde** : certains restent
   l'unique source du schéma d'une fonctionnalité (tableaux de bord métier,
   `deploy_*.sql`). Les neutraliser en bloc casserait un chemin de déploiement
   légitime. Avant d'en appliquer un, vérifier qu'il ne re-`GRANT` pas d'écriture
   sur une table verrouillée par une migration :

```bash
grep -inE "grant (select, ?)?(insert|update|delete).*to (authenticated|anon)|drop policy" <fichier>.sql
```

## Dette à résorber

Porter dans la chaîne versionnée ce qui est encore utile (le cas
`accept/decline_transaction_invitation` a été traité par `p29`), puis archiver
le reste.
