# Journal d'activation MineGrid — phase « valeur de l'existant »

> Programme post-validation : on **active / connecte / alimente** les actifs existants (aucun nouveau module).
> Un livrable par priorité : actif · état avant → après · impacts · risques · rollback.

---

## PHASE 3 — Business Flow Engine (2026-06-15)

> Vision : faire converger 3 moteurs d'entrée (Marketplace / Global Monitor / Besoins pro) vers `Lead → Devis → Dossier → chaîne`. Mapping HONNÊTE (mission : « si un module n'est pas déployé, le documenter »).

| Agent | État | Réalité |
|---|---|---|
| **D — Lead Convergence Engine** | ✅ **livré (clé de voûte)** | `src/utils/leads/leadConvergence.ts` — typologie par moteur d'entrée + scoring (stage/valeur/proba/récence/dossier-gap) + priorisation ; carte « opportunités à saisir » dans le cockpit vendeur (`opportunityCorrelation.ts`), action concrète. Données réelles (`leads`+`quote_requests`), déterministe, 9 tests. |
| **E — Opportunity Engine** | ✅ livré (avec D) | les leads chauds deviennent des opportunités actionnables surfacées au cockpit. |
| **A — Marketplace Engine** | 🟢 partiel déjà fait | CTA « Créer le dossier » (P4) + scoring lead (D) optimisent le flux annonce→dossier. Friction restante = audit, non refait. |
| **F — Transaction Flywheel** | ✅ déjà livré | pont escrow (P1) + flywheel prix (P5) + Partner Trust (Phase 2) alimentent trust/matching/price. |
| **G — Network Effect Engine** | ✅ déjà livré | Partner Network (Phase 2 B/F : meilleur dispo/saturés/à éviter). |
| **H — Cockpit Evolution** | ✅ continu | cockpits = assistants : « que faire / quelle opportunité / quel dossier bloqué / quel partenaire » via signaux M1-M12 + perf + opportunités + risque. |
| **I — Investor Value** | ✅ implicite | trust/réseau/risque/convergence = moats & effets réseau (code, pas rapport). |
| **B — Global Monitor Business** | 🟡 **partiel (lien activé)** | Le lien **Monitor → Lead → Convergence est RÉEL** : les prospects AO du Global Monitor (`GlobalMonitor.tsx`) sont désormais taggés `source:'monitor'` → classés au bon moteur par le Lead Engine. Le pipeline profond « projet→besoin→machine→vendeur » reste bloqué par `market_projects` (non déployée+vide), mais l'amorce Monitor→opportunité fonctionne sans elle. |
| **C — Professional Demand Engine** | ⛔ **schéma absent** | aucune table « besoin pro / service_request » dans le repo ni en prod. La typologie 'pro_demand' du Lead Engine est prête, mais STOCKER un besoin pro = nouveau schéma (hors « activer l'existant »). À spécifier avant build. |

**Validation Phase 3** : tsc + **299 tests** + build ✅. 1 commit (D/E) + revue adversariale.

> Le Lead Convergence Engine est l'**architecture de convergence** demandée : il accepte déjà les 3 typologies de source ; Marketplace alimente réellement aujourd'hui, Monitor et Besoins-pro s'y brancheront **sans refonte** dès que leurs données/schéma existent.

---

## PHASE 2 — chantiers A/B/F/E (2026-06-15)

> Règle anti-façade appliquée à la stratégie : on **n'exécute que ce qui a des données réelles déployées**. Les chantiers dépendant de tables non déployées/vides sont **explicitement bloqués** (pas falsifiés).

| Chantier | État | Détail |
|---|---|---|
| **A — Partner Trust dynamique** | ✅ livré | `src/utils/partner/partnerTrust.ts` — trust par rôle dérivé du Performance Engine ; tiers explicables (insufficient_data/new/bronze/silver/gold) ; le volume seul ne crée pas de confiance ; les annulations plafonnent le tier ; affiché dans 5 cockpits. **Impact investisseur** : moat confiance fondé sur l'exécution réelle. |
| **B+F — Matching intelligent + réseau** | ✅ livré | `src/utils/partner/partnerNetwork.ts` — combine **confiance + charge** ; `best`=meilleur disponible (non saturé/non à éviter), `saturated`, `toAvoid` ; `bestPartnerForInspection/Transport/Customs/Financing` ; surfacé au panneau d'assignation. |
| **E — Fraud & Risk (transaction)** | ✅ livré | `src/utils/risk/transactionRisk.ts` — risque dossier explicable (litige, paiement-avant-inspection, montant 0, partenaire désengagé) ; bannière page dossier ; **aucun faux positif** (signal = fait réel). |
| **C — Global Monitor business** | ⛔ **bloqué data** | `market_projects` **non déployée et vide** → générer des opportunités = inventer. À débloquer : déployer + ingérer `market_projects` (`monitor-service`). |
| **D — Price Intelligence** | 🟡 **partiel** | `price_observations` déployée mais **vide** (aucune vente `released`) → `[]` honnête jusqu'aux vraies ventes (flywheel P5 déjà branché). `machine_views` réel exploitable (vélocité de consultation) — activable. |
| **G — Cockpit optimizer** | ⏸️ différé | suppression de cartes = exige preuve par carte ; à faire prudemment, pas en masse. |
| **H — Automatisations** | ⏸️ partiel possible | suggestions dérivées d'événements réels (ex: inspection validée → proposer financement) faisables en corrélations ; déclencheurs DB = prudence prod. |
| **I — Investor moat** | ✅ implicite | A (trust) + B/F (réseau) + E (risque) **SONT** les flywheels partenaires/confiance — implémentés, pas un rapport. |
| **J — Tests/qualité** | ✅ permanent | +18 tests (trust 6, network 6, risk 6) ; revue adversariale parallèle après chaque lot. |

**Validation cumulée Phase 2** : tsc + **288 tests** + build ✅. 3 commits (A · B+F · E). Anti-façade vérifié par revue multi-agents.

---

## Priorité 1 — PONT ESCROW ✅ (code livré)

**Actif concerné :** les deux systèmes d'escrow déjà présents — `escrow_transactions` (système A, PSP/Stripe, alimente le trust) et `payment_records` (système B, miroir dossier). **Aucun nouveau module** : on relie l'existant.

**État AVANT**
- `escrow_transactions` ignore le dossier (pas de `transaction_case_id`).
- `payment_records` ne touche jamais d'argent (`awaiting_partner`) et n'est jamais relié à l'escrow réel.
- Une « chaîne validée » qui ne déclenche **aucun paiement** ni **aucun recalcul de trust**.

**État APRÈS** (`sql/2026-06_escrow_bridge.sql`)
- Lien bidirectionnel : `escrow_transactions.transaction_case_id` + `payment_records.escrow_transaction_id` (nullables, compat totale).
- **Propagation A→B** par trigger `trg_escrow_sync_payment` (SECURITY DEFINER) : l'état réel de l'escrow (`created/funded/…/released`) est reflété dans `payment_records.status` (`awaiting_partner/held/released/…`) + event `escrow.synced` dans `transaction_events`.
- RPC `open_case_escrow(case)` : ouvre un escrow **statut `created` = NON financé** (aucun paiement simulé) ; RPC `link_case_to_escrow(case, escrow)` : rattache un escrow réel existant. Toutes deux `SECURITY DEFINER`, idempotentes, avec contrôle de partie prenante.
- Cockpit financier : reconnaît désormais `held` et `disputed` (litige à traiter) via `buildPaymentCaseSignals`.

**Mappings d'état (escrow → dossier)** : `created→awaiting_partner` · `funded/inspection_passed/delivered→held` · `released→released` · `refunded→refunded` · `disputed→disputed` · `cancelled→cancelled`.

**Impacts**
- **Métier** : le financier voit l'escrow réel d'un dossier (fonds séquestrés / litige) et peut agir ; l'inspection débloque la libération (chaîne `inspection_passed→delivered→released`).
- **Business** : rend exécutable l'argument *« on ne paie qu'après inspection »* (frais escrow = source de revenu transactionnel) ; relie la chaîne validée à de l'argent réel.
- **Investisseur** : un escrow de dossier **alimente le trust score** (`recompute-trust-score` compte `released`/`disputed` sur `escrow_transactions`) → démarre le flywheel confiance ; gouvernance préservée (écriture argent **toujours** côté serveur/PSP).

**Garde-fous / anti-façade**
- `escrow_transactions` reste **révoqué en écriture** côté client (RLS 0002 inchangée) ; seul le PSP (escrow-webhook, service_role) déplace l'argent.
- `open_case_escrow` exige acheteur + montant + machine réels (`buyer_required`/`amount_required`/`machine_required`) — jamais d'escrow fictif.
- Idempotent (un escrow non terminal par dossier ; trigger sans bruit si déjà synchronisé).

**Risques**
- Divergence de devise (escrow EUR par défaut vs dossier MAD) : `open_case_escrow` force la devise du dossier ; à surveiller si un PSP impose EUR.
- Le miroir ne crée jamais d'argent : tant qu'aucun PSP réel n'émet `funded`, l'escrow reste `created/awaiting_partner` (comportement voulu).

**Rollback**
- `git revert` des 2 commits `feat(escrow bridge)`, ou en base : `drop trigger if exists trg_escrow_sync_payment on public.escrow_transactions;` + `drop function if exists public.open_case_escrow, public.link_case_to_escrow, public._tc_sync_payment_from_escrow, public._escrow_status_to_payment;` (les colonnes nullables peuvent rester sans effet).

**Déploiement** : `SQL_A_APPLIQUER/7_pont_escrow.sql` (idempotent). Validation : tsc + 254 tests + build OK.

**MAJ 2026-06-15 — DÉPLOYÉ EN PROD** ✅ : prérequis `0_prerequis_escrow_prix.sql` (escrow_transactions/escrow_events/price_observations — la couche nextgen n'était PAS déployée, cf. `ETAT_DEPLOIEMENT_REPO_VS_PROD.md`) + `7_pont_escrow.sql` appliqués. Sonde confirme tables + RPC `open_case_escrow`/`link_case_to_escrow`. UI : bouton « Ouvrir le séquestre (escrow réel) » câblé sur la page dossier. Diagnostic : `9_validation_pont_escrow.sql`. Démo : `10_preparer_dossier_demo_escrow.sql`.

---

## Priorité 5 — DATA FLYWHEEL PRIX ✅ (code livré)

**Actif concerné :** `escrow_transactions` (vente réelle) → `price_observations` (déjà présente, vide, deny-par-défaut). **Connexion**, pas de module neuf.

**Avant → Après** : aucune vente n'alimentait l'intelligence prix. Désormais, un escrow **`released`** (vente conclue) insère automatiquement une `price_observation` **`source='sale'`** (prix réel + marque/modèle/année de la machine) via trigger `trg_escrow_to_price_observation` (SECURITY DEFINER, idempotent, traçable par `escrow_transaction_id`).

**Impacts** — **Business/Data** : démarre le flywheel prix (meilleure estimation `estimatePrice` au fil des ventes, signal `'sale'` >> `'listing'`) ; **Investisseur** : data propriétaire cumulative (moat prix). **Anti-façade** : uniquement des ventes réelles, jamais d'observation inventée.

**Risques** : devise hétérogène (escrow EUR/MAD) dans `price_observations` — à normaliser plus tard. **Rollback** : `drop trigger trg_escrow_to_price_observation` + `drop function _escrow_to_price_observation`.

**Déploiement** : `sql/2026-06_price_flywheel.sql`. Dépend du pont escrow (P1) pour relier les ventes aux dossiers.

---

## Priorité 4 — ACTIVER LES SOUS-EXPLOITÉS (1/n) ✅ : CTA « Créer le dossier »

**Actif concerné :** RPC existante `ensure_transaction_case_for_quote_request` (déjà appelée à la soumission d'un devis) + page `LeadsInbox`. **Exposition** d'un actif déjà là.

**Avant → Après** : un devis dont l'acheteur est relié mais **sans dossier** (RLS/réseau au moment de la soumission) n'offrait qu'un état désactivé « — » renvoyant à un backfill SQL. Désormais : **bouton « Créer le dossier »** sur ces lignes → appelle la RPC → le lien « Ouvrir » apparaît. Service `ensureTransactionCaseForQuote` + 4 tests.

**Impacts** — **Métier/UX** : le vendeur transforme un lead en dossier en 1 clic (amorce devis→dossier complétée) ; **Business** : plus de dossiers ouverts = plus de chaîne transactionnelle activée. **Anti-façade** : retours honnêtes (`not_deployed`/`forbidden`), aucun dossier fictif.

**Rollback** : `git revert` du commit `feat(activation P4)`.

**Validation cumulée** : tsc + **258 tests** + build OK.

> Reste de P4 (prochaines itérations, mêmes principes) : `InspectionBadge` (réveil `getCertifiedReport` dead), badge `machine_views`, rendre `FraudInline` visible/mesuré, hooks `platform_events`/`ai_predictions`.
