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

## `src-non-atteint/` — 35 fichiers, ~4 000 lignes (2026-09-28)

Le reste du code jamais atteint depuis `src/main.tsx` ni `src/App.tsx`, trié **un
par un** et non en bloc.

### Comment chaque verdict a été pris

Cinquante fichiers candidats ont été instruits séparément : lecture du fichier,
`grep` de son nom **et de chacun de ses exports** dans tout le dépôt — pas
seulement `src/` : configurations, `scripts/`, `package.json`, `docs/`, `*.md` —
recherche d'un équivalent vivant, et consultation de `git log`.

Puis, **uniquement pour ceux proposés à l'archivage**, deux relecteurs
adversariaux ont cherché à prouver le contraire, sous deux angles distincts :

1. une référence indirecte — ré-export par un `index.ts`, import en guillemets
   doubles, import dynamique, chemin ou casse différents ;
2. une raison non-code — cité par la configuration, un script npm, la
   documentation, ou fonctionnalité annoncée pas encore branchée.

**Un seul contradicteur convaincant suffisait à bloquer l'archivage** : on
préfère garder un fichier inutile que supprimer un fichier utile.

### Résultat : 35 archivés, 15 gardés

Parmi les gardés, quatre l'ont été **grâce à cette relecture** :

| Gardé | Pourquoi |
|---|---|
| `src/test/setup.ts` | **Déclaré dans `vitest.config.ts:14`** (`setupFiles`). L'archiver cassait les 603 tests. Invisible pour une analyse qui ne part que de `main.tsx`. |
| `src/constants/dashboardConfig.ts` | Contredit par un relecteur. |
| `src/components/dashboard/layout/TopBar.tsx` | Contredit par un relecteur. |
| `src/components/dashboard/layout/MainDashboardLayout.tsx` | Contredit par un relecteur. |

Les onze autres ont été gardés d'emblée : fonctionnalités annoncées en attente de
branchement (`nextgen/escrow`, `nextgen/finance`, `nextgen/registry`,
`plannedEnterpriseWidgets`), ou composants d'usage général plausible
(`LocationPicker`, `NotificationCenter`, `ThemeProvider`, `ThemeToggle`).

Vérifié après déplacement : `tsc` 0 erreur, **603 tests verts**, build OK.

## Le reste du code mort, pas encore traité

Les 15 fichiers gardés ci-dessus restent dans `src/`. Ils ne sont atteints par
aucun chemin d'import, mais chacun a une raison identifiée d'y rester. À
réexaminer quand la fonctionnalité correspondante sera branchée — ou abandonnée.
