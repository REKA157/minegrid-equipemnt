# SQL historique — ne rien exécuter d'ici

Ces scripts ont servi entre 2025 et juillet 2026, **avant** que le schéma ne soit
versionné dans `supabase/migrations/`. Ils sont conservés comme trace, pas comme
outil.

## ⛔ Ne jamais les rejouer

Ils ont déjà été appliqués à la main en production, et leur contenu est
aujourd'hui **entièrement repris dans la baseline versionnée**
(`supabase/migrations/00000000000000_baseline.sql` : 7 670 lignes, 67 tables,
219 policies). Les rejouer irait de l'inutile au destructeur selon le script.

## Ce qui a été vérifié avant d'archiver (2026-09-28)

| Dossier | Fichiers | Statut vérifié |
|---|---|---|
| `SQL_A_APPLIQUER/` | 12 | **Déjà appliqué en production.** `escrow_transactions`, `escrow_events`, `price_observations`, `transaction_cases`, `transaction_participants` répondent toutes en prod. Le nom du dossier mentait depuis des mois. |
| `sql/` | 44 | Correctifs datés et scripts de déploiement métier, tous repris dans la baseline. Exceptions : `sql/nextgen/*` crée `finance_applications` et `finance_partners`, **qui n'existent ni en production ni dans la baseline** — ces scripts n'ont jamais été appliqués et ne le seront pas en l'état. |

Aucun code exécutable ne référençait ces chemins : les seules mentions vivaient
dans les rapports d'audit de `.audit/`, qui sont eux-mêmes des documents
historiques.

## Pourquoi ce rangement

Le 2026-08-18, **cinq pannes** ont eu la même origine : un objet présent dans une
base et absent dans l'autre, sans registre pour le dire. Le SQL vivait alors dans
**quatre emplacements** — `supabase/migrations/`, `sql/`, `SQL_A_APPLIQUER/` et
`archive/scripts/sql/` — dont un nommé « à appliquer » alors qu'il était appliqué.
Quatre sources de vérité pour un seul schéma, c'est la garantie qu'aucune ne soit
fiable.

## La règle, désormais

**Tout SQL destiné à une base vit dans `supabase/migrations/`.** Un seul endroit,
horodaté, avec ses contre-cas dans `supabase/tests/`.

Deux garde-fous le maintiennent :

- `npm run verifier:sql` refuse tout fichier `.sql` apparu hors des emplacements
  autorisés ;
- `npm run bases` compare production et staging et signale tout écart, ainsi que
  les objets absents des deux.
