# MineGrid — Product OS Evolution : cartographie & backlog priorisé

> Issu d'une cartographie multi-agents (lecture seule, preuves fichier:ligne). Règle directrice :
> **améliorer → connecter → corréler → enrichir → repositionner → masquer → supprimer**.
> La suppression est le dernier recours, seulement si valeur métier nulle **prouvée**.

## Statut global

Plateforme **réelle** (marketplace + dossier transaction + 8 dashboards entreprise alimentés par
`enterpriseApi` réel + 5 dashboards métier réels). Pré-lancement : beaucoup de schéma déployable
mais peu peuplé. **Espace défendable = trust / inspection / dossier**, pas le listing.

| Domaine | real | partial | mock | stub | dead |
|---|---|---|---|---|---|
| Routes & écrans (~47) | 24 | 8 | 6 | 1 | 8 |
| Widgets métier (19) | 7 | 4 | 5 | 2 | 1 |
| Widgets entreprise (47) | 38 | 2 | 0 | 3 (planned) | 4 (Financier) |
| Backend tables/RPC/edge (~60) | ~17 | ~22 | 1 | ~20 | 0 |
| Services transverses (~36) | ~22 | ~12 | 1 | 1 | 0 |
| NextGen inline (~14) | 5 | 4 | 0 | 2 | 3 |

## Corrélations cross-module à fort levier (le vrai produit = relier des tables déjà réelles)

| # | Corrélation | Signal à révéler | Donnée source réelle |
|---|---|---|---|
| C1 | quote_requests ↔ leads | un devis n'apparaît pas dans le Kanban | `leads.machine_id`/`quote_request_id` |
| C2 | machine ↔ lead ↔ devis | nb leads/devis par annonce | `leads.machine_id` + `quote_requests.machine_id` |
| C3 | machine ↔ machine_views | popularité/urgence jamais affichée | `machine_views` (réelle) |
| C4 | seller ↔ trust_profiles | confiance vendeur invisible sur les cartes | `trust_profiles` (RLS public, à peupler) |
| C5 | machine ↔ price_observations | « sous le marché » / fraude prix (mort) | RPC `estimate_price` absente ; fallback médiane annonces |
| C6 | inspection ↔ trust ↔ fiche | grade d'inspection certifié non affiché | `inspection_reports.certified` (réel, 0 appelant UI) |
| C7 | financement ↔ dossier | demande crédit non liée au dossier | `credit_applications.transaction_case_id` (FK inutilisée) |
| C8 | transport ↔ dossier | livraison non liée au dossier | `deliveries.transaction_case_id` (FK inutilisée) |
| C9 | Global Monitor ↔ stock (tous métiers) | besoins projet non corrélés au parc | `buildMonitorContextBySourceIds` (vendeur seul) |
| C10 | dossier = workflow | 10 statuts, aucune transition UI | services `transactionPlatform` + `transaction_events` |
| C11 | services désirés structurés | texte libre au lieu de jsonb | colonne `quote_requests.desired_services` |
| C12 | monitor-service ↔ market_projects | table Intelligence vide | ingestion monitor → `market_projects` |

## BACKLOG

### 🟢 Quick-wins (S — données déjà là, fort impact)

| # | Titre | Cible | Action | Source réelle | État |
|---|---|---|---|---|---|
| Q1 | Fermer la façade premium client | `premium.ts` | corriger | pro_clients / stripe-webhook | ✅ fait (058c4fc3) |
| Q9 | Compteur modale widgets entreprise | `EnterpriseDashboardShell.tsx` | améliorer | validIds | ✅ fait (058c4fc3) |
| Q3 | Filtre catégorie/secteur en SQL | `SectorMachines.tsx`, `Machines.tsx` | améliorer | `.eq('category', …)` | à faire |
| Q4 | Recherche texte brand/model/description | `Machines.tsx:336` | améliorer | champs déjà présents | ✅ fait (06187674) |
| Q5 | Persister `total_hours` à la publication | `PublicationRapide.tsx` | corriger | champ saisi non inséré | ✅ fait (06187674) |
| Q6 | Badge demandes/vues sur « Mes Annonces » | `PublicationRapide.tsx` | corréler | leads/quote_requests/machine_views | à faire |
| Q7 | Estimation prix médiane client | `inline.tsx`, `priceService.ts` | enrichir | médiane machines brand/model/year | ✅ fait (c369b7a5) |
| Q8 | Remplacer `listingAgeMinutes` codé en dur | `inline.tsx:108` | corriger | `machines.created_at` | ✅ fait (c369b7a5) |
| Q10 | Garde-fou email autoSpecs/communication | `communicationService.ts` | connecter | edge `send-contact-email` | à faire |
| Q2 | Bandeau « Mode démo » (gating localStorage) | `EnterpriseDashboardShell.tsx` | repositionner | flag widgetsTemporaryAccess | ✅ bandeau (5e91dd7f) ; durcissement serveur à planifier |

### 🟡 Fort levier (M — corrélations cross-module)

| # | Titre | Action | Source réelle |
|---|---|---|---|
| M1 | Pont quote_requests → leads | corréler | seeder lead `source='quote_request'` |
| M2 | CTA « Créer le dossier » dans LeadsInbox | connecter | RPC `ensure_transaction_case_for_quote_request` |
| M3 | SellerTrustInline sur cartes/recherche | repositionner | `trust_profiles` (dépend L2) |
| M4 | Badge « Inspecté MineGrid » sur fiche | connecter | `getCertifiedReport` (réel, DEAD) |
| M5 | Espace « Mes demandes » acheteur | connecter | `quote_requests` filtré buyer |
| M6 | FinancingRequest lié au dossier | corréler | `credit_applications.transaction_case_id` |
| M7 | Câbler actions stub pipeline/stock | améliorer | `RealPipelineService`, `createStockOrder` |
| M8 | CTA « Demander un transport » → request | corréler | `deliveries.transaction_case_id` |
| M9 | desiredServices jsonb | connecter | `quote_requests.desired_services` |
| M10 | Global Monitor → stock tous métiers | corréler | `buildMonitorContextBySourceIds` |
| M11 | Widgets génériques → services réels | connecter | getDashboardStats / getSalesEvolutionSeriesData |
| M12 | CA réel au lieu de offres×50000 | améliorer | `offers.amount` / `transaction_cases` |

### 🔴 Structurant (L — infra/déploiement, espace défendable)

| # | Titre | Action | Source réelle |
|---|---|---|---|
| L1 | Déployer RPC `estimate_price` | améliorer | `estimatePrice.ts` (testée) → SQL sur `price_observations` |
| L2 | Peupler trust_profiles + écran soumission vérifs | connecter | `submitVerification`/`getMyVerifications` (réels, DEAD) |
| L3 | Réactiver les 3 widgets planned | connecter | inspection_requests/transport_requests/finance_applications |
| L4 | Workflow d'écriture TransactionCasePage | connecter | services listByCase + INSERT transaction_events |
| L5 | Ingestion monitor-service → market_projects | connecter | tables monitor → `market_projects` |
| L6 | Réconcilier double schéma `inspection_requests` | corriger | conflit 0001 vs transaction_platform_extended |

### ⚫ Nettoyage (suppression — valeur métier nulle prouvée uniquement ; à valider)

| # | Cible | Action | Justification |
|---|---|---|---|
| N1 | `SalesEvolutionWidget.tsx` (random), `DailyActionsWidget`, `PerformanceWidget`, `InventoryWidget` | supprimer | non montés / remplacés / placeholders |
| N2 | `Equipment.tsx`, `EquipmentDetail.tsx`, `MachineList.tsx`, `SubcategoryPage.tsx`, `Premium.tsx`, `EnterpriseDashboard.tsx` legacy | supprimer | jamais routés, doublons statiques |
| N3 | edge `exchange-rates` | supprimer | doublon mort (front utilise la RPC SQL) |
| N4 | `ProSubscription.tsx`, `ConfigurationPro.tsx` | **repositionner** | logique proApi réelle → router (NE PAS supprimer) |
| N5 | `FinancierWidgets.js` | repositionner | catalogue sans Display → créer Display ou retirer |
| N6 | `ApiDocs.tsx` | masquer | API inexistante → façade |
| N7 | doublons (SalesPipelineWidget×2, SidebarMenu×2, mensualité×3, tarifs transport×2) | factoriser | divergences de comportement |

## Risques restants & angles morts

1. **Sécurité — contournement paiement** (#5) : write client partiellement neutralisé (Q1 ✅) ; reste le gating localStorage app-wide (Q2, à valider car affecte la démo).
2. **Sécurité — isolation cross-tenant par RLS seule** : 6 rôles entreprise font des SELECT non scopés en code → auditer les policies RLS de chaque `sql/deploy_*.sql` avant exposition.
3. **Façade involontaire trust/prix** : PriceVsMarketInline rend null (RPC absente), SellerTrustInline « non vérifié » pour tous (table vide). Débloqué par Q7 + L1 + L2.
4. **Conflit schéma `inspection_requests`** (0001 vs transaction_platform_extended) : bug latent dépendant de l'ordre de déploiement (L6).
5. **Façade `market_projects`** : table vide tant que L5 non fait.
6. **Bus-factor / secrets** : dépendances externes (`VITE_N8N_*`, `VITE_MONITOR_API_URL`) échouent silencieusement si absentes.
7. **Triple représentation** quote_requests / leads / transaction_cases sans synchro de statut garantie.
8. **Attribution Global Monitor** : prospects AO assignés au métier `vendeur` par défaut (localStorage) → mauvaise attribution possible.

## Avancement (cette session, branche `refactor/product-os`)

- ✅ `transaction-cases` activé (5 rôles) — connecter
- ✅ Registry `planned-widgets` (3 coquilles conservées, masquées) — masquer + documenter
- ✅ `stock-status` : engagement réel (machine_views/offers/messages), fin du random — connecter
- ✅ `daily-actions` vendeur : confirmé déjà réel (auto-charge) — clarifier
- ✅ `sales-evolution` : suggestions IA réelles (serveur/local) — connecter
- ✅ Q1 façade premium + Q9 compteur — corriger
- ✅ Q7+Q8 fiche machine : estimation prix médiane client (déblocage PriceVsMarketInline/FraudInline) + vélocité fraude réelle (`created_at`)
- ✅ Q4+Q5 : recherche multi-champs (brand/model/description) + persistance `total_hours`
- ✅ Q2 : bandeau « Mode démo » sur les dashboards entreprise
- **Reste quick-wins** : Q3 (filtre catégorie SQL), Q6 (badges Mes Annonces), Q10 (garde-fou email)
- ✅ Q1 complet : durcissement RLS DB `premium_services` + tests anti-contournement (préservés)
- ✅ **Cockpit décisionnel « Que dois-je faire aujourd'hui ? »** — assistants **vendeur** + **loueur** (Revenu / Priorités / Risques / Opportunités) sur données 100 % réelles, en tête des dashboards entreprise. Logique pure testée, extensible aux 7 autres rôles. *(Phases 6/7/9)*
- Validation cumul : tsc + 152 tests + build OK

## Assistants métier (cockpits) — état

| Rôle | Cockpit | Source réelle |
|---|---|---|
| Vendeur | ✅ livré | leads (pipeline) + machine_views/messages/offers |
| Loueur | ✅ livré | rentals + parc machines/interventions |
| Mécanicien | ✅ livré | interventions/repairs/inventory/technicians |
| Transporteur | ✅ livré | deliveries/drivers/vehicles |
| Courtier | ✅ livré | credit_applications/insurance_policies/clients |
| Investisseur | ✅ livré | investments/investment_opportunities |
| Logisticien | ✅ livré | logistics_* + transaction_cases |
| Transitaire | ✅ livré | customs_declarations/freight_* |
| Financier | ✅ livré *(dashboard à router, cf N5)* | rentals + courtier + dossiers |

> **9/9 cockpits livrés.** Chaque carte passe le test « quelle action concrète en découle ? ». Les cartes cross-module dossier (inspection→escrow mécanicien, financement→dossier courtier/financier, transport/douane→dossier) sont **spécifiées et codées en `availableToday=false`** : elles s'activeront automatiquement dès que les tables `transaction_platform` (inspection_requests, financing_requests, transport_requests, customs_cases…) seront peuplées par un workflow dossier. C'est le levier N1 restant (cf L3/L4).

### Corrélations cross-module M1-M12 — état

| # | Corrélation | État | Surface |
|---|---|---|---|
| M1 | devis → lead/action | ✅ réel | cockpit vendeur (quote_requests × dossier) |
| M2 | lead → dossier (avancement) | ✅ réel | cockpit vendeur (transaction_cases) |
| M3 | dossier → trust | ✅ inline | fiche machine (SellerTrustInline) — pas d'action cockpit |
| M4 | dossier → inspection | 🔌 branché, gated | cockpit mécanicien (inspection_requests) |
| M5 | inspection → escrow | 🔌 branché, gated | cockpit financier (payment_records) |
| M6 | escrow → finance | 🔌 branché, gated | cockpit courtier + financier (financing_requests) |
| M7 | finance → transport/logistique | 🔌 branché, gated | cockpit transporteur + logisticien (transport_requests) |
| M8 | Global Monitor → opportunité | ✅ réel | cockpit vendeur (leads × monitor) |
| M9 | Global Monitor → vendeur | ✅ réel | cockpit vendeur (idem M8) |
| M10 | machine → estimation prix | ✅ inline | fiche machine (PriceVsMarketInline, médiane marché) |
| M11 | machine → risque fraude | ✅ inline | fiche machine (FraudInline, vélocité + prix) |
| M12 | messages → prochaine action | ✅ réel | cockpit vendeur (messages non lus) |

> 🔌 *branché, gated* = corrélation codée + testée + branchée au cockpit. Le **write-side qui crée les lignes existe désormais** (cf. ci-dessous) ; les cartes M4-M7 s'affichent dès que la migration SQL est appliquée et qu'un participant déclenche une étape. Anti-façade : zéro donnée simulée. Module : `src/components/dashboard/cockpit/correlations/`.

### Write-side dossier (L3/L4) — livré (code)

| Élément | Fichier | Rôle |
|---|---|---|
| RPC `SECURITY DEFINER` | `sql/2026-06_transaction_chain_write_side.sql` | create_inspection/payment/financing/transport/customs_step + advance_transaction_case_step ; idempotent, contrôle de participation, anti-doublon |
| Services client | `src/utils/api/transactionChain.ts` | wrappers RPC, retour honnête (`not_deployed`/`forbidden`/`created`) |
| Déclencheur UI | `src/pages/TransactionCasePage.tsx` | panneau « Faire avancer le dossier » → crée les lignes |

> **Sécurité** : `payment_records` n'est jamais écrit côté client (escrow en `awaiting_partner`, jamais de paiement simulé) ; sans participant du rôle requis → `à assigner`.

### Réseau partenaire (assignation) — livré (code)

| Élément | Fichier | Rôle |
|---|---|---|
| RPC `SECURITY DEFINER` | `sql/2026-06_transaction_participant_assign.sql` | `assign_transaction_partner(case, role, email)` + `revoke_transaction_partner` + helper `_tc_can_invite` ; invitation réservée vendeur/acheteur/admin_delegate, partenaire résolu par email dans `auth.users` (anti-façade), idempotent (clé `case+user+role`) |
| Services client | `src/utils/api/transactionChain.ts` | `assignTransactionPartner` / `revokeTransactionPartner`, retour honnête (`assigned`/`revoked`/`not_deployed`/`forbidden`/`partner_not_found`) |
| UI | `src/pages/TransactionCasePage.tsx` | panneau « Assigner un partenaire » (rôle + email) + bouton révoquer sur chaque partenaire |

> Effet : dès qu'un partenaire d'un rôle est assigné, l'étape de chaîne correspondante lui est **attribuée** (au lieu de « à assigner ») et apparaît dans son cockpit (M4 mécanicien, M5/M6 financier/courtier, M7 transporteur/logisticien, transitaire douane).
>
> **Reste à faire** : appliquer les **deux migrations SQL** sur la base (dans l'ordre) — `sql/2026-06_transaction_chain_write_side.sql` puis `sql/2026-06_transaction_participant_assign.sql` — pour activer le bout-en-bout. Étape suivante possible : invitation/acceptation par le partenaire (`accepted_at`) + notification.

**Rollback** : `git checkout merge/nextgen-integrated-experience` · ou `git reset --hard backup/before-product-os`.
