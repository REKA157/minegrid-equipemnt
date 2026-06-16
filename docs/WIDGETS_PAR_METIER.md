# Widgets par métier — seconde passe (transformer avant de supprimer)

> Règle : un widget n'est supprimé QUE s'il ne peut pas être connecté à un moteur réel
> (Lead Convergence · Global Monitor · Devis · Dossiers · Trust · Partner Trust · Risk
> Engine · Price Intelligence · transaction_events) pour produire une **reco / alerte /
> opportunité / action**. Sinon : **transformer**. Anti-façade : aucune donnée simulée.
>
> Moteurs réels disponibles (déjà construits) : `leadConvergence`, `partnerTrust`,
> `partnerPerformance`, `transactionRisk`, escrow bridge (`payment_records`↔`escrow_transactions`),
> price flywheel (`price_observations`), `transaction_events`.

---

## 🟢 VENDEUR
**Décisions/jour** : qui relancer, quel prix poser, quelle annonce booster, quel dossier avancer.
**Pertes de temps** : trier les leads à la main, pas de priorisation. **Risques** : leads chauds oubliés, prix hors marché. **Opportunités** : prospects AO (Monitor), demande détectée.

| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| SalesPipelineWidget (29/30) | réel | Lead Convergence (score/priorité) | priorisation + action | **enrich** |
| StockStatusWidget (29/30) | réel | Price Intelligence + machine_views | reco prix/boost | **keep** |
| SalesPerformanceScoreWidget (26/30) | réel | Partner Perf / leads | reco | **enrich** |
| SalesEvolutionWidgetEnriched (22/30) | réel | sales_evolution | alerte écart | **enrich** |
| TransactionCasesWidget (20/30) | réel | Risk Engine (dossier) | alerte dossier risqué | **enrich** |
| MarketAlertWidget (21/30) | **mock** | **Global Monitor** (`market_alerts`) | opportunité veille | **transform** (data bloquée) |
| PriceEstimatorWidget (11/30) | saisie | **Price Intelligence** (`estimatePrice`/`price_observations`) | reco prix réel | **transform** |
| AIInsightsWidget (8/30) | **façade** | Lead Convergence + machine_views | reco fondée | **transform** |
| `SalesEvolutionWidget` (0/30) | **random** | — (doublon de l'Enriched réel) | — | **SUPPRIMER** |
| `PerformanceWidget` (0/30) | vide | — (aucune donnée, aucun rôle) | — | **SUPPRIMER** |
| `VendeurWidgets` (config) | morte | — (jamais rendue) | — | **SUPPRIMER** |
| `DailyActionsWidget` / `…Fixed` | démo | — (doublon de DailyActionsPriority réel) | — | **SUPPRIMER** |

## 🟡 LOUEUR
**Décisions** : quel engin relouer, quelle maintenance planifier. **Risques** : engin dormant, retour en retard. **Opportunités** : taux d'utilisation, location à confirmer.

| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| UpcomingRentalsWidget (19/30) | mock fallback | `rentals` réel | alerte à confirmer | **transform** |
| EquipmentAvailabilityWidget ×2 | prop only | `machines`/`rentals`/interventions | alerte dispo/maintenance | **transform** |
| InventoryStatusWidget (19/30) | **random** (`Math.random` dormantDays) | `machines`+`machine_views` réels | alerte engin dormant + action prix | **transform** |
| `InventoryWidget` (0/30) | façade statique | — (doublon de InventoryStatus) | — | **SUPPRIMER** |

## 🔧 MÉCANICIEN / INSPECTEUR
**Décisions** : quelle intervention prioriser, quel grade donner. **Risques** : retard SLA. **Opportunités** : inspection certifiée → trust.

| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| QuickInterventionForm (18/30) | réel | createIntervention | action | **keep** |
| PreventiveMaintenanceWidget (16/30) | réel (prop) | interventions + **Partner Perf** | alerte SLA + action | **enrich** |
| InspectionGradeWidget (8/30) | saisie | **`inspection_reports`** + Partner Trust | action (certifier) → trust | **transform** |
| InspectionRequestWidget (25/30) | réel | inspection_requests | action | **keep** |

## 🚚 TRANSPORTEUR
| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| QuickDeliveryForm (16/30) | réel | createDelivery + **transport_requests** (dossier) | action | **enrich** |
| LogisticsWidget (14/30) | grille codée | `transport_requests` + Partner Trust (meilleur transporteur) | devis + reco partenaire | **transform** |

## 🛃 TRANSITAIRE
Aucun widget dédié aujourd'hui (douane gérée par le cockpit `customs_cases`). **Opportunité** : un widget « dossiers douane à traiter » branché sur `customs_cases` + Partner Trust transitaire — à créer SEULEMENT si besoin réel (sinon le cockpit suffit).

## 💰 FINANCIER / COURTIER
**Décisions** : accorder/scorer un crédit, ouvrir un escrow. **Risques** : litige paiement, scoring faible. **Opportunités** : financement lié au dossier.

| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| QuickCreditApplicationForm (17/30) | réel | createCreditApplication + **dossier** | action | **enrich** |
| EscrowFlowWidget (7/30) | toggles | **escrow bridge** (`escrow_transactions`/`payment_records`) | état réel + action | **transform** (≠ supprimer) |
| FinancePrescoringWidget (4/30) | saisie | **`financing_requests`** + Risk Engine + Partner Trust | reco scoring + action | **transform** (≠ supprimer) |
| QuickInsurancePolicyForm (14/30) | **taux mock** | tarif réel OU marquer « simulation » | action honnête | **transform** |

## 📈 INVESTISSEUR
| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| QuickOpportunityForm (17/30) | réel | createOpportunity + **Global Monitor** | opportunité | **enrich** |
| QuickInvestmentForm (12/30) | saisie | investments réels + Price Intelligence | reco fondée | **transform** |

## 🔔 TRANSVERSE (trust / risk / alertes / IA)
| Widget | État | Connecter à | Produit | Verdict |
|---|---|---|---|---|
| **TrustScoreWidget** (8/30) | saisie | **Partner Trust** déjà calculé (Phase 2) | trust réel + tier | **transform** (≠ supprimer) |
| **FraudWidget** (4/30) | saisie | **Risk Engine** (`transactionRisk`) réel | alerte risque réelle | **transform** (≠ supprimer) |
| **NotificationsWidget** (7/30) | prop codée | **transaction_events** réels | alerte | **transform** (≠ supprimer) |
| AdvancedKPIsWidget (12/30) | prop codée | KPIs réels (Partner Perf) | suivi | **transform** |
| PerformanceScoreWidget (14/30) | prop | Partner Perf réel | reco | **transform** |
| AIOptimizationWidget (4/30) | générique | Price Intelligence (pricing) | reco prix | **transform** ou supprimer si redondant |
| ChatWidget (22/30) | réel (n8n) | — | support | **keep** |
| `AIWidgets` (config) | morte | — (jamais appelée) | — | **SUPPRIMER** |

---

## Bilan de la seconde passe

- **1ᵉʳ audit** : 10 « remove ». **Après 2e passe** : seulement **7 suppressions justifiées** (vraiment mortes/doublons/config jamais rendue) : `SalesEvolutionWidget` (random, doublon), `PerformanceWidget` (vide), `InventoryWidget` (doublon), `VendeurWidgets`+`AIWidgets` (configs mortes), `DailyActionsWidget`+`…Fixed` (doublons de DailyActionsPriority).
- **3 « remove » deviennent « transform »** : `FinancePrescoringWidget`, `NotificationsWidget`, (et `EscrowFlowWidget` était déjà enrich) — ils PEUVENT se connecter à un moteur réel.
- **Gisement n°1** : brancher les widgets « façade saisie-utilisateur » sur les moteurs **déjà construits** — `TrustScoreWidget`→Partner Trust, `FraudWidget`→Risk Engine, `EscrowFlowWidget`→escrow bridge, `PriceEstimatorWidget`→Price Intelligence. Zéro nouveau moteur, suppression de 4 façades, gain immédiat.
- **Bloqués data** : `MarketAlertWidget`/opportunités Monitor (→ `market_projects` non déployée), Price Intelligence (`price_observations` vide jusqu'aux ventes).

---

## Phase 4 — exécutions (2026-06-15)

| Widget | Action | Détail |
|---|---|---|
| **TrustScoreWidget** | ✅ **transformé** | simulateur à saisie → assistant **Réseau Partenaire** réel (`buildNetworkForRole` : recommandé/à éviter/saturés par rôle). Anti-façade : état vide si pas de donnée. |
| **InventoryStatusWidget** | ✅ **transformé** | **7 `Math.random` supprimés** (dormance/visibilité/clics/délai/usageTrend/usageRate) + délais codés en dur retirés. Recommandations/KPI/alertes dérivés UNIQUEMENT du réel ; champs absents masqués. |
| **SalesEvolutionWidget** | 🗑️ **supprimé** | façade `Math.random`, code mort non monté ; version réelle `SalesEvolutionWidgetEnriched` conservée. |

Validation à chaque étape : tsc + 303 tests + build. Méthode « transformer avant supprimer » appliquée : 2 transformés (branchés sur moteurs réels), 1 supprimé (irrécupérable + doublon).

**Suite (même protocole)** : `FraudWidget`→Risk Engine · `EscrowFlowWidget`→escrow bridge · `PriceEstimatorWidget`→Price Intelligence · `NotificationsWidget`→transaction_events · puis les 6 autres suppressions justifiées (configs mortes, doublons DailyActions).
