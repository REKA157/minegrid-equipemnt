# Audit métier des widgets MineGrid

> 39 widgets évalués sur le code réel (audit multi-agents + synthèse). Anti-façade : tout widget utilisant des données simulées est marqué non-réel.

Voici l'audit demandé.

# AUDIT PRODUIT — 39 Widgets MineGrid

## 1. Synthèse

**Répartition des verdicts (39 widgets)**

| Verdict | Nombre | % |
|---|---|---|
| **keep** | 6 | 15 % |
| **enrich** | 14 | 36 % |
| **rethink** | 7 | 18 % |
| **remove** | 12 | 31 % |
| **Total à refondre/supprimer (rethink+remove)** | **19** | **49 %** |

**Indicateurs de santé**

- **Données réelles** : 18 widgets sur 39 (46 %) chargent de vraies données ; **21 (54 %) tournent sur props statiques, mocks, ou `Math.random()`**.
- **Source unique** : 22 widgets (56 %) ne lisent qu'une seule source — aucune corrélation transverse.
- **Façade pure** (aucune donnée réelle ET aucune action persistée) : **9 widgets** — `AIWidgets`, `DailyActionsWidget`, `DailyActionsWidgetFixed`, `SalesEvolutionWidget`, `PerformanceWidget`, `InventoryWidget`, `VendeurWidgets`, `FinancePrescoringWidget`, `NotificationsWidget`.
- **Façade dangereuse (random déguisé en réel)** : 2 cas critiques — `SalesEvolutionWidget` (`Math.random()*0.4`) et `InventoryStatusWidget` (dormantDays/visibilityRate/averageSalesTime générés aléatoirement mais présentés comme métriques métier).
- **Actions non câblées** : ~17 widgets affichent des boutons d'action (Agir, Booster, Baisser prix, Contacter, Marquer lu) qui ne déclenchent qu'un `toast`/`console.log` sans mutation BD.

**Lecture directeur produit** : la moitié du parc widget est cosmétique. Le risque #1 n'est pas l'absence de fonctionnalité mais la **fausse confiance** : des widgets qui affichent des chiffres inventés (random) comme s'ils étaient des KPI métier. À supprimer en priorité avant qu'un commercial ne prenne une décision dessus.

---

## 2. Matrice notée (note globale /30 = somme des 6 axes)

*Triée : remove puis rethink d'abord, puis enrich, puis keep.*

| Widget | Rôle | Décision | Action réelle | Données | /30 | Verdict |
|---|---|---|---|---|---|---|
| SalesEvolutionWidget | Commercial | Aucune (random) | Aucune | random | **0** | remove |
| PerformanceWidget | Aucun | Aucune | Aucune | Aucune | **0** | remove |
| InventoryWidget | Resp. inventaire | Aucune | Aucune | props vides | **0** | remove |
| DailyActionsWidgetFixed | Commercial junior | Fictive | Toast/natif | hardcoded | **1** | remove |
| AIWidgets | Architecte dashboard | Aucune | Aucune | config statique | **1** | remove |
| VendeurWidgets (config) | Vendeur | Aucune | Aucune | hardcoded | **1** | remove |
| DailyActionsWidget | Commercial | Aucune | console.log | props legacy | **2** | remove |
| AIOptimizationWidget | Resp. optimisation | Priorisation | Texte statique | mock local | **4** | remove |
| FinancePrescoringWidget | Courtier finance | Pré-score | Aucune (RLS) | user input | **4** | remove |
| NotificationsWidget | Tous | Tri/filtre | Aucune | props statiques | **5** | remove |
| AIInsightsWidget | Gest. commercial | Ajustement strat. | Refresh | mock/monitor | **8** | rethink |
| FraudWidget | Risk officer | Détect. fraude | Aucune | user input | **4** | rethink |
| FinancePrescoringWidget (dup) | — | — | — | — | — | — |
| InsuranceFormWidget (QuickInsurancePolicyForm) | Courtier assur. | Créer police | createPolicy | taux mock | **14** | rethink |
| QuickInvestmentForm | Investisseur | ROI engin | createInvestment | saisie | **12** | rethink |
| TrustScoreWidget | Trust layer | Calc. score | Aucune | user input | **8** | rethink |
| InspectionGradeWidget | Inspecteur | — *(enrich)* | — | — | — | — |
| EquipmentAvailabilityWidget (#1) | Resp. location | Voir dispo | Filtre seul | props | **12** | rethink |
| InventoryStatusWidget | Resp. stock | Stock dormant | Toast only | **random** | **19** | rethink |
| AdvancedKPIsWidget | Gest. opérationnel | Piloter KPI | Façades vides | props hardcoded | **12** | enrich |
| EscrowFlowWidget | Opérateur escrow | Simuler flux | Aucune | user input | **7** | enrich |
| InspectionGradeWidget | Inspecteur | Calc. grade | Aucune persist. | user input | **8** | enrich |
| EquipmentAvailabilityWidget (#2) | Resp. parc | État dispo | Boutons vides | props réelles | **13** | enrich |
| PerformanceScoreWidget | Vendeur/Manager | Score perf | Agir = façade | props simulées | **14** | enrich |
| QuickDeliveryForm | Dispatcher | Planif. livraison | createDelivery | réelles | **16** | enrich |
| PriceEstimatorWidget | Évaluateur | Estim. prix | Affiche | saisie | **11** | enrich |
| QuickCreditApplicationForm | Courtier crédit | Créer demande | createCredit | réelles | **17** | enrich |
| UpcomingRentalsWidget | Resp. location | Confirmations | Callback ext. | mock fallback | **15** | enrich |
| PreventiveMaintenanceWidget | Chef maintenance | Planif. interv. | createInterv. | Supabase | **16** | enrich |
| QuickOpportunityForm | Investisseur sourcing | Évaluer opp | createOpp | réelles | **17** | enrich |
| SalesEvolutionWidgetEnriched | Dir. commercial | Croissance/target | Export + stubs | sales_evolution | **21** | enrich |
| SalesPerformanceScoreWidget | Directeur/Vendeur | Benchmark perf | Agir = stub | convergent + IA | **26** | enrich |
| DailyActionsPriorityWidget | Sales ops | Pipeline jour | Appel/complete réel | leads+msg+offers | **14** | enrich |
| MarketAlertWidget | Commercial veille | Test matching | Affiche match | hardcoded | **22** | keep |
| LogisticsWidget | Resp. logistique | Coût/délai | Devis indicatif | grille fixe | **14** | keep |
| QuickInterventionForm | Resp. maintenance | Créer OT | createInterv. | réelles | **18** | keep |
| ChatWidget | Client/Visiteur | Contact support | API n8n réelle | n8n+WhatsApp | **22** | keep |
| TransactionCasesWidget | Resp. dossier | Voir dossiers RLS | Actualiser | API RLS réelle | **20** | keep |
| InspectionRequestWidget | Acheteur | Demander inspect. | Crée requête BD | Supabase réel | **25** | keep |
| SalesPipelineWidget | Manager ventes | Qualifier pipeline | 6 actions/lead | leads réels | **29** | keep |
| StockStatusWidget | Vendeur/stock | Booster stock | 6 actions décis. | multisource réel | **29** | keep |

*Note : les scores DailyActionsPriorityWidget et PerformanceScoreWidget reflètent leur composante d'action réelle vs façade. SalesPipelineWidget et StockStatusWidget dominent le parc à 29/30.*

---

## 3. Widgets à REPENSER (rethink / remove) — pourquoi ils échouent et comment les transformer

### Catégorie A — À SUPPRIMER sans regret (façades mortes)

**`SalesEvolutionWidget`, `PerformanceWidget`, `InventoryWidget`, `AIWidgets`, `VendeurWidgets`, `DailyActionsWidget`, `DailyActionsWidgetFixed`**

- **Pourquoi ils échouent** : aucune donnée réelle, aucune action persistée, et pour la plupart **déjà remplacés** par une version enrichie (`SalesEvolutionWidget` → `SalesEvolutionWidgetEnriched`, `DailyActionsWidget*` → `DailyActionsPriorityWidget`). Ce sont des doublons morts qui polluent la config et le bundle.
- **Action** : suppression pure. Garder uniquement la version « Enriched/Priority ». `SalesEvolutionWidget` est le plus toxique : son `Math.random()*0.4` produit une courbe de ventes crédible mais fausse — un commercial peut décider d'un pricing sur du bruit.
- **`VendeurWidgets` (config)** : ne pas supprimer le fichier aveuglément — c'est le manifeste du dashboard vendeur. Le **refondre** pour ne déclarer que les widgets réellement implémentés (`stock-status`, `sales-pipeline`, `sales-performance-score`, `sales-evolution`, `transaction-cases`, `daily-actions-priority`) et **retirer** `ai-insights`/`ai-optimization` tant qu'ils n'ont pas de source réelle.

### Catégorie B — À SUPPRIMER ou fusionner (IA creuse)

**`AIInsightsWidget` (rethink), `AIOptimizationWidget` (remove)**

- **Pourquoi ils échouent** : insights « augmentez votre inventaire d'Excavatrices » avec fallback hardcoded (25 % de gain, nombres aléatoires), **jamais croisés avec les leads réels** du Kanban. Aucun bouton n'agit.
- **Transformation (réutiliser Lead Convergence)** : ne pas faire un widget IA isolé. **Fusionner la couche IA dans `SalesPipelineWidget` et `StockStatusWidget`** qui ont déjà les vraies données. La recommandation devient : « Machine X a 0 lead en 30j malgré 200 vues → baisser le prix de 8 % » — calculée sur `machine_views` + `leads` + `offers` réels, avec **bouton « Appliquer » câblé** sur l'action existante de StockStatus (booster/promo flash). L'insight sans action câblée n'a pas de raison d'exister comme widget autonome.

### Catégorie C — À CONNECTER au backend réel (logique bonne, données fictives)

**`InventoryStatusWidget` (rethink — le plus trompeur)**

- **Pourquoi il échoue** : le widget le plus riche du lot (filtres, modales analytics, reco IA) mais **dormantDays / visibilityRate / averageSalesTime sont `Math.random()`**. Toutes les actions = `toast` sans mutation.
- **Transformation** : (1) calculer `dormantDays` depuis `machines.created_at`/`last_click` réel, `visibilityRate` depuis `machine_views` / search ranking ; (2) câbler chaque action sur une vraie mutation Supabase (baisse prix → `update machines.price`, booster → flag premium, recommander → envoi via Lead Convergence) ; (3) **le fusionner avec `StockStatusWidget`** qui fait déjà la vraie version — il y a redondance fonctionnelle. Garder un seul widget stock.

**`EquipmentAvailabilityWidget` (deux variantes, rethink/enrich) + `UpcomingRentalsWidget`**

- **Pourquoi ils échouent** : affichage-pur sur props/mock, dépendance cachée au parent, boutons « Louer/Confirmer/Modifier » inertes.
- **Transformation** : créer un `RealRentalService.getRentals()` / `getFleet()` avec RLS, **fusionner les deux EquipmentAvailability en un seul**, câbler les actions de location (créer location → table `rentals`, confirmer retour, planifier maintenance via lien direct vers `QuickInterventionForm`/`PreventiveMaintenanceWidget`). Corréler `usageRate > 80 %` → alerte maintenance préventive.

### Catégorie D — À TRANSFORMER en dashboard live (simulateurs pédagogiques)

Ces widgets ont une **logique métier solide et testée**, mais s'appliquent sur du *user input* au lieu de données réelles. Ils ne sont pas faux — ils sont juste débranchés des actifs existants.

| Widget | Échec | Transformation (actif à réutiliser) |
|---|---|---|
| **EscrowFlowWidget** (enrich) | Simule un flux, ne crée aucune transaction | Lire `escrow_transactions` en live ; brancher sur le **moteur Escrow** existant ; déclencher depuis `InspectionRequestWidget` (inspection OK → libération fonds) |
| **TrustScoreWidget** (rethink) | Barème robuste mais sur toggles utilisateur | Devenir « Mon profil de confiance » : lire `trust_profiles` + `verification_records` + transactions `released` ; recommander la prochaine vérif à ajouter |
| **FraudWidget** (rethink) | Règles solides sur input manuel | Déplacer `fraudSignals()` **côté serveur sur `listing_created`** : flag auto + alerte modérateur si score > 70. Réutiliser le **Risk layer** |
| **FinancePrescoringWidget** (remove) | RLS bloque la création côté client (service_role only) | Supprimer le widget client. Le pré-scoring est déjà serveur → l'exposer comme résultat dans `TransactionCasesWidget`, pas comme calculatrice |
| **InspectionGradeWidget** (enrich) | Calcule un grade, ne persiste rien | Charger l'`inspection_request` live, sauvegarder dans `inspection_reports`, générer PDF certifié, mettre à jour `inspection_requests.status` |
| **QuickInsurancePolicyForm** (rethink) | Prime « estimée » = formule mock → fausse offre | Brancher API/grille assureur réelle ou afficher explicitement « estimation indicative » ; corréler au parc `machines` assuré |
| **QuickInvestmentForm** (rethink) | Carnet de notes, ROI sur hypothèses non validées | Lier à `machines` réelles + indice prix marché (`price_observations`) ; corréler aux `interventions` (coût maintenance dans le ROI) |
| **NotificationsWidget** (remove) | Read-only sur props, « Marquer lu » inerte | Remplacer par gestionnaire d'alertes Supabase realtime + mutations ; brancher sur les alertes que Pipeline/Stock génèrent déjà |

---

## 4. Top widgets (keep) — ce qui marche et pourquoi en faire le modèle

1. **`SalesPipelineWidget` (29/30)** — Référence absolue. Vraies données `leads` (stage/value/probability), **alertes heuristiques métier** (lead bloqué >7j, devis sans suivi >3j, high-value >500k MAD à risque, conversion <20 %), 3 vues (liste/kanban/timeline), 6 actions par lead. *Manque mineur* : persister le drag-drop Kanban en BD. **C'est le patron à généraliser.**

2. **`StockStatusWidget` (29/30)** — Cœur métier vendeur. Multisource réel (`machines` + `machine_views` + `offers` + `messages` + `leads` + monitor), **score visibilité déterministe (pas de random)**, alignement stock↔pipeline, comparaison prix marché, 6 actions décisionnelles qui génèrent du revenu (booster, promo flash, pricing). Aucun mock.

3. **`InspectionRequestWidget` (25/30)** — Maillon de confiance. Crée une vraie transaction `inspection_requests`, déclenche le downstream (assign → report → escrow), feedback honnête démo vs prod. Proactivité maximale.

4. **`ChatWidget` (22/30)** & **`MarketAlertWidget` (22/30)** — Canaux réels (n8n + WhatsApp, fallback résilient) ; logique d'alerte `matchAlert()` réutilisée côté cron serveur.

5. **`TransactionCasesWidget` (20/30)** — Lecture propre avec **RLS enforced côté API**, deeplinks, états vides explicites. Modèle d'intégration plateforme correcte.

**Dénominateur commun des keep** : (a) source de vérité Supabase chargée *dans* le widget, pas en prop ; (b) heuristiques déterministes auditables, jamais de `Math.random()` ; (c) actions qui écrivent réellement en BD ; (d) honnêteté démo/prod.

---

## 5. Corrélations transverses manquantes (récurrentes)

Cinq angles morts reviennent sur la quasi-totalité du parc. Les combler vaut plus que n'importe quel nouveau widget.

1. **Score ⇄ Évolution ⇄ Pipeline désynchronisés.** `SalesPerformanceScoreWidget`, `SalesEvolutionWidgetEnriched` et `SalesPipelineWidget` lisent les mêmes leads mais ne se parlent pas : une évolution dégradée ne fait pas bouger le score, le score ne relit pas le pipeline. → **Un seul `RealPipelineService` comme source unique**, les trois widgets s'y abonnent via `pipeline:refresh` (déjà dispatché par plusieurs formulaires).

2. **Lead ⇄ Machine quasi jamais exploité.** `lead.machine_id` existe mais n'est pas joint : impossible de dire « ce lead concerne cette annonce, qui a X vues ». → Brancher **Lead Convergence sur `machines`** pour fermer la boucle vue → lead → offre → transaction.

3. **Actions ⇄ Mutation BD absente partout.** Le pattern dominant des widgets faibles : un bouton qui fait `toast`/`console.log`. Aucune écriture, aucun feedback post-action. → Règle produit : **tout bouton d'action câble une mutation Supabase ou n'existe pas.**

4. **Trust / Risk / Escrow / Inspection en silos.** Quatre actifs qui forment une chaîne naturelle (inspection OK → grade → trust score ↑ → escrow libéré ; fraude détectée → trust ↓ → listing flag) mais aucun ne lit l'autre. → Câbler la **chaîne de confiance** : `InspectionRequest` → `InspectionGrade` → `TrustScore` → `EscrowFlow`, avec `FraudWidget` en garde-fou serveur.

5. **Stock ⇄ Maintenance ⇄ Forecast jamais reliés.** `InventoryStatusWidget`, `PreventiveMaintenanceWidget` et `EquipmentAvailabilityWidget` ignorent que la même machine y figure (usage rate élevé → maintenance due ; pièce en stock → réservable pour OT ; stock-out forecast). → Clé de jointure unique `machine_id`/`equipment_id` partagée entre les trois.

**Priorité d'exécution recommandée** : (1) supprimer les 12 façades + le random toxique cette semaine ; (2) câbler les mutations BD sur les `enrich` à fort score (Sales*, Quick*Form, PreventiveMaintenance) ; (3) fermer la boucle Lead⇄Machine et la chaîne de confiance ; (4) fusionner les doublons (3 widgets stock → 1, 2 EquipmentAvailability → 1).