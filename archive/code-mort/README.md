# Code jamais atteint par l'application

Ce qui est ici ne se compile plus, ne part plus dans le paquet livré, et n'est
plus relu par personne. Rien n'est perdu : `git log --follow` retrouve tout
l'historique, et un `git mv` suffit à ramener un fichier dans `src/`.

## `pages-enterprise-widgets/` — 33 fichiers, 8 779 lignes (2026-09-28)

Ancien `src/pages/enterprise/widgets/`. C'était un **deuxième jeu de widgets**,
parallèle à `src/components/dashboard/widgets/`, avec cinq fichiers portant
exactement le même nom que leur jumeau vivant :

| Fichier | Version vivante | Cette version |
|---|---|---|
| `ChartWidget.tsx` | 364 lignes | 533 |
| `ListWidget.tsx` | 306 | 135 |
| `MetricWidget.tsx` | 404 | 371 |
| `SalesPipelineWidget.tsx` | 1 586 | 1 354 |
| `EquipmentAvailabilityWidget.tsx` | 183 | 217 |

Ce ne sont pas des copies mais des **versions divergentes** : deux réponses
différentes au même besoin, qu'il fallait lire toutes les deux pour savoir
laquelle s'exécutait. Réponse : aucune.

### Comment on sait qu'il est mort

La racine de ce sous-arbre, `WidgetComponent.tsx` (462 lignes), **n'a aucun
importateur**. Tout ce qu'il tirait derrière lui tombe avec lui.

Vérifié de trois façons indépendantes :

1. **Graphe d'imports résolu** depuis `src/main.tsx` et `src/App.tsx` : chaque
   chemin relatif résolu contre le dossier du fichier qui l'écrit, en suivant
   aussi les `import()` dynamiques. 33 des 34 fichiers du dossier sont
   inatteignables.
2. **Un audit antérieur** (`AUDIT_CONTROL/outils/A05-atteignabilite.json`, août
   2026) avait conclu la même chose, sur les mêmes 33 fichiers.
3. **`tsc`, les 538 tests et le build** passent après le déplacement.

Angles morts écartés avant d'agir : aucun `import.meta.glob`, aucun import
dynamique construit par gabarit, aucun alias de chemin (`vite.config.ts` et
`tsconfig.json` n'en déclarent aucun), aucune référence depuis un test.

### Deux erreurs commises en chemin, et ce qu'elles ont coûté

- Un premier relevé annonçait **92 fichiers / 20 178 lignes** de code mort. Il
  ne reconnaissait que les imports en guillemets **simples** : tout
  `src/pages/pro/widgets/` (5 534 lignes) y passait à tort, alors que
  `ProDashboard.tsx` l'importe en guillemets doubles. L'écart avec l'audit
  antérieur a mis la puce à l'oreille. Chiffre corrigé : **83 fichiers,
  14 644 lignes**.
- Le dossier comptait **34** fichiers, dont **33** morts. Déplacer le dossier
  entier a emporté `InventoryStatusWidget.tsx`, qui lui est bien utilisé par
  `WidgetRenderer`. `tsc` l'a signalé immédiatement ; le fichier est retourné
  dans `src/`.

### Ce que ça ne change pas

Le paquet livré ne rétrécit pas (598 ko avant comme après) : ce code n'y entrait
déjà plus, le bundler l'écartait tout seul. Le gain est pour qui lit le dépôt —
plus de fausse piste à 8 779 lignes — et pour `tsc`, qui n'a plus à le vérifier.

## Le reste du code mort, pas encore traité

Il subsiste environ **50 fichiers / 5 900 lignes** jamais atteints, dispersés
(`QuoteGenerator.tsx`, `ConfigurationPro.tsx`, `EquipmentDetail.tsx`,
`NotificationCenter.tsx`, les doublons `dashboard/TopBar` et
`dashboard/layout/TopBar`…). Ils n'ont **pas** été déplacés : contrairement au
fork ci-dessus, ce sont des pages et composants isolés dont certains peuvent
attendre un rebranchement volontaire. Chacun mérite d'être tranché un par un,
pas en bloc.
