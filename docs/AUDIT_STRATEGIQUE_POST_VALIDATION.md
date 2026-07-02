# Audit stratégique MineGrid — maximiser la valeur de l'existant

**Date :** 2026-06-15 · **Après** validation de la chaîne transactionnelle (cf. `VALIDATION_CHAINE_TRANSACTIONNELLE.md`)
**Méthode :** cartographie multi-agents ancrée dans le code réel (6 piliers) → synthèse stratège → **critique adversariale** (investisseur/architecte sceptique). Ce rapport est la version **corrigée après critique** : chaque affirmation non vérifiable a été retirée ou requalifiée.
**Règle d'or :** aucune opportunité ne suppose un module neuf ; chacune cite l'actif réel (`fichier` / table / RPC) déjà livré.

---

## Constat de cadrage (corrigé)

1. **La profondeur de code dépasse de loin la profondeur de données.** 8 tables transactionnelles, 10 RPC `SECURITY DEFINER`, 9 cockpits, 12 corrélations, Trust Layer, Global Monitor : tout est en prod, mais l'essentiel tourne sur **1 dossier réel** et beaucoup de tables **schema-only**. La valeur est dans **l'activation**, pas dans du code neuf.

2. **⚠️ Le produit a DEUX moitiés d'escrow réelles mais déconnectées** (correction majeure de la critique) :
   - **Système A — `escrow_transactions` + Edge `create-payment`/`stripe-webhook` + `escrowService.ts`** : le **seul** capable d'exécuter un vrai séquestre Stripe, et il **alimente déjà le trust score** (`recompute-trust-score/index.ts` lit `escrow_transactions.status`).
   - **Système B — `payment_records`** (la « chaîne validée ») : trace tout le dossier mais **ne touche jamais d'argent** (`awaiting_partner`).
   - **Le pont A↔B n'existe pas.** Tant qu'il manque, l'argument « on ne paie qu'après inspection » reste une promesse non exécutable. **C'est le chantier structurant n°1**, et il était absent du séquencement initial.

3. **Le récit « 3 verrous serveur bloquent tout » est partiellement faux.** Plusieurs leviers à forte valeur sont **activables aujourd'hui** sans rien déverrouiller (détaillés en Quick Wins). Ne pas créer de fausse dépendance bloquante.

---

## 1. Opportunités business

| # | Opportunité | Actif réel | Statut honnête |
|---|---|---|---|
| B1 | **Traçabilité transactionnelle = argument B2B ≥ 100k€** : timeline horodatée inspection→financement→transport→douane supprime la black-box de négociation. | `transaction_cases` + `transaction_events` (7/dossier, validés prod) + `chainCorrelation.ts` | ✅ réel, prouvé |
| B2 | **Escrow conditionné à l'inspection = dérisquage bilatéral.** | `payment_records` (dossier) **+ pont à construire vers** `escrow_transactions` (PSP) | 🔶 nécessite le pont A↔B |
| B3 | **Monétisation par étape via réseau partenaire** (chaque rôle facture son étape, traçabilité qui-valide-quoi). | `transaction_participants` (role, accepted_at) + `transaction_events` (actor_user_id) | ✅ socle réel |
| B4 | **Amorce devis→lead→dossier déjà automatisée** : un devis crée un lead Kanban **et** la RPC dossier est prête. | trigger `trg_quote_requests_sync_lead` + RPC `ensure_transaction_case_for_quote_request` (grant authenticated) | ✅ réel — sous-exploité (CTA manquant) |

**Levier maître :** B1 + B4 + (B2 une fois le pont fait) = *« la seule plateforme où l'acheteur voit la chaîne complète et ne paie qu'après inspection certifiée »*. B4 est le **vrai quick-win d'amorce** (RPC déjà prête).

---

## 2. Opportunités UX

| # | Opportunité | Actif réel |
|---|---|---|
| UX1 | **CTA « Créer le dossier » dans `LeadsInbox`** : la RPC existe, le lien lead↔dossier est déjà propagé par trigger ; il manque juste le bouton. | `ensure_transaction_case_for_quote_request` + propagation `leads.transaction_case_id` (trigger) |
| UX2 | **Badge inspection certifié sur fiche machine** : `getCertifiedReport()` est livré mais **jamais appelé** (dead). | `getCertifiedReport` (`inspectionService.ts`) + `inspection_reports.certified` |
| UX3 | **Badge « N vues cette semaine » / « très consulté »** sur fiche machine = urgence d'achat, donnée déjà agrégée. | `machine_views` (`sql/machine_views.sql`) + `getDashboardStats` |
| UX4 | **Badge « engagée dans N dossier(s) »** sur l'annonce (réciproque M1). | `transaction_cases.machine_id` (FK reverse) |
| UX5 | **État pédagogique** au lieu du cockpit vide silencieux (« Assignez un mécanicien pour activer cette carte »). | `CockpitSummary.tsx` |

---

## 3. Opportunités métier

| # | Opportunité | Actif réel | Statut |
|---|---|---|---|
| ME1 | **Cockpit mécanicien — inspections assignées** (`getAssignedInspections(mechanic_id)`). | `inspection_requests` + `buildMecanicienCockpit.ts` (M4 branché, gated) | 🟢 quasi-prêt |
| ME2 | **Détection fraude déjà LIVE** : `FraudInline` se déclenche sur prix-vs-marché + vélocité (<60 min & >50k) + absence d'images, **sans attendre aucun verrou**. | `fraudSignals` (`inline.tsx`) + fallback prix + `machines.created_at` (Q8 ✅) | ✅ **déjà actif** — à surfacer/mesurer |
| ME3 | **Scoring crédit enrichi par confiance vendeur** (vendeur vérifié = meilleur taux). | `scoreApplication.ts` + `trust_profiles` (après peuplement) + `financing_requests` | 🔶 dépend trust peuplé |
| ME4 | **Receipt inspection = droit au paiement** (inspecteur valide → libération escrow). | `inspection_reports.certified` + pont escrow | 🔶 dépend pont A↔B |

---

## 4. Opportunités investisseur

| # | Angle | Preuve réelle |
|---|---|---|
| I1 | **Anti-façade vérifiable & gouvernance write-side** : aucune donnée inventée, 10 RPC `SECURITY DEFINER`, montants = `total_amount`, retours honnêtes (`not_deployed`/`forbidden`). | 10 RPC idempotentes + `chainCorrelation.ts` (`[]` si vide) + suites de tests |
| I2 | **Chaîne validée end-to-end en prod** (preuve datée, reproductible). | `VALIDATION_CHAINE_TRANSACTIONNELLE.md` + `6_validation_lecture_seule.sql` |
| I3 | **Profondeur = barrière temps** : 6 piliers, 9 cockpits, 12 corrélations, ~30 connecteurs `monitor-service` déjà construits. Risque d'**exécution**, pas de techno. | `registry.*` + `monitor-service` + tests cockpits |
| I4 | **Boucle de validation chiffrée** (MAPE estimation vs ventes) — *mesurable via* `ai_predictions.output` **+ libération `escrow_transactions`** (⚠️ **pas** via `transaction_cases.final_amount` qui n'existe pas). | `ai_predictions` + `escrow_transactions.status='released'` |

**Message investisseur :** *« Tout est construit et testé ; la traction tient à quelques branchements serveur, pas à 6 mois de R&D. »*

---

## 5. Fonctionnalités sous-exploitées (à réactiver)

| Actif | Statut réel | Action |
|---|---|---|
| `getCertifiedReport()` | **dead** (zéro appel UI) | Brancher `InspectionBadge` sur la fiche machine (UX2) |
| `ensure_transaction_case_for_quote_request` | **réel, sans CTA** | Bouton « Créer le dossier » dans `LeadsInbox` (UX1) |
| `FraudInline` | **réel & live, non valorisé** | Le rendre visible + instrumenter (ME2) |
| `machine_views` | **réel, jamais affiché côté acheteur** | Badge vues/urgence (UX3) |
| `SellWithVerification.tsx` | **routé** (`/nextgen/vendre`) **mais simulateur** : n'appelle jamais `submitVerification()` | ⚠️ Le « router » ne débloque RIEN. Écrire le **formulaire d'upload + appel `submitVerification`** (chantier L, pas S) |
| `recompute-trust-score` (Edge) | **EXISTE déjà** (barème 60 pts complet) | Le **déclencher** (trigger sur `inspection_reports.certified` / cron) — la moitié serveur est écrite |
| `platform_events` / `ai_predictions` | append-only prêt, non branché | Logger chaque estimation servie → feature-store / suivi dérive |
| `credit_applications.transaction_case_id` | FK **dans une migration conditionnelle** (`links_and_triggers.sql`) — ⚠️ déploiement non prouvé | Vérifier qu'elle est en prod **avant** de la qualifier de quick-win |

> Correction critique : l'idée que « le prix/fraude est mort tant qu'`estimate_price` n'est pas déployée » est **fausse** — l'UI fonctionne **déjà** via le fallback client `estimateMachinePriceFromListings` (médiane sur `machines`, Q7 ✅). Déployer la vraie RPC est une **amélioration de qualité**, pas un déverrouillage.

---

## 6. Corrélations encore absentes (tables réelles non reliées)

| Croisement manquant | Tables réelles | Valeur / Note |
|---|---|---|
| **🔴 `payment_records` (dossier) ↔ `escrow_transactions` (PSP)** | les 2 systèmes d'escrow | **La plus forte** : sans ce pont, la « chaîne validée » ne touche jamais d'argent ni n'alimente le trust. Priorité structurante n°1. |
| **`inspection_reports.certified` → `recompute-trust-score`** | inspection × Edge trust | Edge **déjà écrite** ; il manque **1 trigger** qui l'appelle après certification. |
| **M13 — `machines` ↔ `transaction_cases`** | machine × dossier | Badge « engagée dans N dossiers » (UX4). FK reverse présente. |
| **`credit_applications.transaction_case_id` ↔ `financing_requests`** | crédit × dossier | Cockpit courtier voit le financement réel (vérifier FK déployée). |
| **`escrow_transactions.status='released'` → `price_observations(source='sale')`** | vente × prix | Amorce du data-flywheel prix — sur le **bon** système (A), pas sur `final_amount` inexistant. |
| **⚠️ `customs_cases` DOUBLE DÉFINITION** | `0003_logistics…` (logistics_quote_id) vs `transaction_platform_extended` (dossier) | Même classe de bug latent que le conflit `inspection_requests` (L6) — **à auditer avant exposition douane**. |

---

## 7. Effets réseau potentiels

1. **Réseau partenaire certifié** (actif partiel aujourd'hui) — chaque invitation acceptée (`transaction_participants.accepted_at`) ajoute un partenaire ; plus de partenaires = dossiers traités plus vite = plus de vendeurs.
2. **Boucle confiance** — vérif → score → conversion. **Gelée** tant que `verifications` n'est pas peuplée (UI de soumission manquante) — pas tant que l'Edge manque (elle existe).
3. **Data-flywheel prix** — chaque vente `escrow_transactions='released'` peuple `price_observations(source='sale')` → meilleure estimation → meilleure détection fraude. **Gelé** (price_observations vide, deny-par-défaut).
4. **Détection besoins projet** — plus de leads `source_id` Global Monitor = meilleur matching stock. **Gelé** tant que `market_projects` n'est pas ingérée.

---

## 8. Moats défendables

| Moat | Actif réel | Solidité |
|---|---|---|
| **Gouvernance write-side** (jamais d'écriture client directe) | 10 RPC `SECURITY DEFINER` + index uniques partiels | ✅ réel, vérifié |
| **Chaîne transactionnelle traçable + escrow conditionnel** | chaîne validée **+ pont escrow** | 🔶 fort **une fois le pont fait** |
| **Trust Layer propriétaire** (data cumulative) | `trust_profiles` + `computeTrustScore.ts` + Edge `recompute-trust-score` | 🔶 réel mais `verifications` à peupler |
| **Couverture ingestion ~30 sources** | `monitor-service` (`fingerprint.py` sha256, géocodage) | ✅ construit, ingestion à brancher |
| **Indices prix propriétaires** | `price_observations` | ⚠️ **vide & deny-par-défaut** — moat *potentiel*, pas actuel |

---

## 9. Sources de revenus nouvelles

| Source | Modèle | Actif réel | Pré-requis honnête |
|---|---|---|---|
| **Commission par étape transaction** | transactionnel | `transaction_participants` + `transaction_events` → `commission_records` | workflow réel + pont escrow |
| **Frais escrow (% montant)** | transactionnel | `escrow_transactions` (système A, **le seul qui paie**) | pont A↔B |
| **Abonnement Data Intelligence** | récurrent | `market_projects` (RLS abonnés) | ingestion (table vide) |
| **Rapports prix B2B** (OEM/assureurs) | one-shot/récurrent | `price_observations` + `ai_predictions` | peuplement + k-anonymat |
| **Certification inspecteur** | frais + commission | `inspectors` + `inspection_reports.certified` | back-office revue |
| **Alertes WhatsApp premium** | add-on | `market_alerts.channel` | API WhatsApp Business **sur VPS brut** (jamais Railway/Heroku) |

---

## 10. Fonctionnalités qui DOIVENT devenir prioritaires (corrigé)

Par effet de déblocage réel :

1. **🔴 Pont `payment_records` ↔ `escrow_transactions`** — rend exécutable l'argument escrow (le moat central) et **branche le trust score** sur les vraies ventes. *Omis du plan initial — c'est la priorité n°1.*
2. **CTA « Créer le dossier » dans `LeadsInbox`** — transforme l'amorce déjà automatisée en dossiers d'un clic (RPC prête). **Vrai quick-win d'activation.**
3. **UI de soumission de vérifications + Edge `approve-verification` + back-office**, puis **trigger → `recompute-trust-score`** (déjà écrite) — le seul vrai trou côté Trust.
4. **Surfacer ce qui est déjà live** : `FraudInline`, badge `machine_views`, `InspectionBadge` (`getCertifiedReport`).
5. **Dette de schéma** : réconcilier `inspection_requests` (L6) **et** `customs_cases` (double définition).
6. *(amélioration, pas déverrouillage)* RPC `estimate_price` réelle + peuplement `price_observations` — améliore la qualité du prix/fraude déjà fonctionnel.

---

# Classement final (reprioritisé)

### 🟢 Quick Wins — effort S, activables MAINTENANT (sans aucun verrou serveur)
| Item | Impact | Actif réel |
|---|---|---|
| **CTA « Créer le dossier » dans LeadsInbox** | Élevé (amorce) | `ensure_transaction_case_for_quote_request` (RPC prête, grant authenticated) |
| Badge « N vues cette semaine » sur fiche machine | UX/urgence | `machine_views` + `getDashboardStats` |
| `InspectionBadge` (réveil `getCertifiedReport` dead) | Conversion | `inspectionService.ts` + `inspection_reports` |
| Rendre `FraudInline` visible + l'instrumenter | Anti-arnaque (fort en Afrique) | `fraudSignals` (déjà live) |
| Badge M13 « engagée dans N dossiers » | UX | `transaction_cases.machine_id` |
| État pédagogique cockpit vide | Rétention | `CockpitSummary.tsx` |

### 🔵 Haut ROI — effort M, déblocage en cascade
| Item | Impact | Actif réel |
|---|---|---|
| **Trigger `inspection_reports.certified` → `recompute-trust-score`** | Très élevé (Edge déjà écrite) | Edge existante + `inspection_reports` |
| `getAssignedInspections` → cockpit mécanicien | Élevé | `inspection_requests` + `buildMecanicienCockpit.ts` |
| Hooks `platform_events`/`ai_predictions` sur `create_*_step` | Élevé (feature-store) | `platform_events` + `transactionChain.ts` |
| Badge « dossier #X » sur le lead (triple-sync déjà en base) | Moyen | propagation `case_id` (triggers `links_and_triggers.sql`) |

### 🟠 Structurant — effort L, fondations durables
| Item | Impact | Actif réel |
|---|---|---|
| **🔴 Pont `payment_records` ↔ `escrow_transactions`** | **Critique** (rend l'escrow & le trust réels) | les 2 systèmes d'escrow existants |
| UI soumission vérifs + Edge `approve-verification` + back-office | Très élevé (moat trust) | `submitVerification` + `verifications` + Storage |
| Réconcilier dual schema `inspection_requests` (L6) **+** `customs_cases` | Dette critique | `0001` vs `transaction_platform_extended` / `0003` |
| Ingestion `market_projects` (L5) | Très élevé (revenu data) | `monitor-service` |

### 🟣 Différenciant — moats durs à copier
| Item | Actif réel |
|---|---|
| Inspection certifiée → libération escrow conditionnelle (après pont) | `inspection_reports.certified` + `escrow_transactions` |
| Score confiance dans le scoring crédit | `scoreApplication.ts` + `trust_profiles` |
| Détection besoins projet cross-métiers (×8 rôles) | `buildMonitorContextBySourceIds` + cockpits |
| Indices prix propriétaires k-anonymisés *(une fois `price_observations` peuplée)* | `price_observations` + `ai_predictions` |

### 🟡 Investisseur — preuves chiffrables
| Item | Actif réel |
|---|---|
| Chaîne validée end-to-end (preuve datée) | `VALIDATION_CHAINE_TRANSACTIONNELLE.md` |
| Gouvernance anti-façade (10 RPC `SECURITY DEFINER`) | RPC + tests |
| Boucle MAPE via `ai_predictions` + ventes `escrow_transactions` (pas `final_amount`) | `ai_predictions` + système A |
| KPI confiance (% vérifiés, délai revue) *(après peuplement `verifications`)* | `verifications.status` + `trust_profiles` |

---

# Séquencement (activation d'existant uniquement)

### 30 jours — « Allumer ce qui est déjà câblé, sans verrou »
1. **CTA « Créer le dossier »** dans `LeadsInbox` (RPC prête) — l'amorce devis→dossier devient cliquable.
2. **Quick wins UI** : `InspectionBadge`, badge `machine_views`, `FraudInline` visible, badge M13, état pédagogique cockpit.
3. **Trigger `certified` → `recompute-trust-score`** (Edge déjà écrite) + commencer l'**UI de soumission de vérifs** (réveille `verifications`).

→ Résultat : amorce dossier fluide, fiches machines avec urgence + alerte fraude + grade inspection, premiers scores de confiance recalculés.

### 90 jours — « Rendre l'escrow & les flywheels réels »
4. **🔴 Pont `payment_records` ↔ `escrow_transactions`** — la chaîne validée déclenche un vrai séquestre et nourrit le trust. *Le déblocage le plus structurant.*
5. **Edge `approve-verification` + back-office de revue** — termine la boucle confiance.
6. **Réconcilier les schémas** `inspection_requests` (L6) + `customs_cases`.
7. **Ingestion `market_projects`** + *(amélioration)* RPC `estimate_price` + peuplement `price_observations`.

→ Résultat : escrow exécutable, Trust Layer vivant, premières corrélations data, métriques de moat présentables en levée.

---

## Annexe — corrections apportées par la critique adversariale (transparence)

| Affirmation initiale (synthèse) | Correction (vérifiée dans le code) |
|---|---|
| `estimate_price` = « SQL testé à déployer », quick-win | **Aucun SQL n'existe** (c'est du TS client) ; l'UI prix/fraude **fonctionne déjà** via fallback. Rétrogradé en *amélioration*. |
| Un seul système d'escrow | **Deux** systèmes réels & déconnectés ; le **pont** est le vrai chantier (priorité n°1). |
| Edge `recompute-trust-score` absente | **Elle existe** (complète) ; le trou réel = `approve-verification` + UI soumission + back-office. |
| « Router `SellWithVerification` » = quick-win S | La page est **déjà routée** ; le travail réel (formulaire upload + `submitVerification`) est un chantier **L**. |
| `transaction_cases.final_amount` pour la MAPE | **Colonne inexistante** ; utiliser `ai_predictions` + ventes `escrow_transactions`. |
| `price_observations` opérationnelle | **Vide & deny-par-défaut** ; moat *potentiel*, pas actuel. |
| Amorce « entièrement manuelle » | **Déjà automatisée** par triggers (devis→lead + RPC dossier) ; manque seulement le CTA. |
| `FraudInline` mort sans les verrous | **Déjà live** aujourd'hui. |
| Conflit de schéma `customs_cases` | **Non vu** par la synthèse — ajouté (jumeau de L6). |

> Cet audit applique au plan stratégique la même règle anti-façade que le code : ne présenter comme « actif » que ce qui l'est réellement, et nommer explicitement ce qui est *potentiel*, *gelé* ou *à construire*.
