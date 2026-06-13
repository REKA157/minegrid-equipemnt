# AI_STRATEGY.md — MineGrid NextGen

> Stratégie IA, rédigée par le Head of AI. Document de cadrage : il décide **quoi
> construire, dans quel ordre, et surtout quoi NE PAS construire**. Aucune fonction
> n'est listée ici sans problème métier chiffré, données identifiées (table + colonnes
> réelles), faisabilité MVP immédiate et ROI.
>
> Schémas de référence : `sql/nextgen/0001_trust_and_inspection.sql`,
> `0002_escrow_and_finance.sql`, `0003_logistics_intelligence_data.sql`.
> État projet : pré-lancement, bus-factor 1, domaine encore non résolu (NXDOMAIN).
> Conséquence directe : **au démarrage, la donnée est rare** → on commence en
> heuristique (règles/statistiques), pas en ML. Le ML est une roadmap, pas un MVP.

---

## 1. Principes

1. **L'IA sert le métier, jamais l'inverse.** Une fonction n'existe que si elle
   déplace une métrique : conversion, litiges, GMV financée, engagement. Pas de
   « chatbot IA » ni de génération de texte décorative au lancement.
2. **La donnée d'abord.** On ne spécifie une fonction que si la donnée existe
   *aujourd'hui* (table + colonnes réelles) ou est trivialement collectable via
   `platform_events`. Pas de modèle qui suppose une donnée qu'on n'a pas.
3. **Pas de façade — heuristique MVP vs ML roadmap explicitement séparés.** Au
   lancement, presque tout est règle/statistique (médiane, écart-type, filtres
   pondérés). Le ML (gradient boosting, anomaly detection, embeddings) n'arrive
   qu'une fois le volume de données atteint (seuils chiffrés ci-dessous). On ne
   prétend jamais « faire de l'IA » quand on fait une médiane — on l'assume.
4. **Traçabilité obligatoire.** *Toute* sortie de modèle (heuristique comprise)
   est écrite dans `public.ai_predictions(model, subject_type, subject_id, output,
   confidence)`. Un `output` jsonb porte les détails (`{estimate, low, high, n,
   method}` ou `{risk, reasons[]}`). `model` versionne (`price_estimate_v1`). Ceci
   donne : audit, A/B, calcul de précision a posteriori, et la preuve investisseur
   que la sortie est reproductible — pas un appel LLM opaque.
5. **Le LLM est interdit là où une statistique suffit.** Coût et non-déterminisme
   d'un LLM ne se justifient que pour du langage non structuré (résumé d'un rapport
   d'inspection, extraction d'un PDF douanier). Estimer un prix avec un LLM serait
   une faute professionnelle : on a `price_observations`, on fait des maths.
6. **Inférence côté serveur uniquement.** Les sorties sensibles (prix de référence,
   score de fraude, score vendeur) sont calculées par Edge Function / RPC sous
   `service_role`, jamais en lecture de table brute côté client. C'est déjà la règle
   du projet : `price_observations` n'a **aucune policy SELECT** (deny par défaut),
   exposée seulement via RPC d'estimation.

### Ce qu'on REJETTE explicitement (anti-gadget)

| Idée rejetée | Pourquoi |
|---|---|
| Chatbot/assistant LLM généraliste | Coût récurrent par message, hallucinations sur prix/specs, aucun ROI mesurable au lancement. Le besoin réel (devis) est déjà couvert par `quote_requests`. |
| Description d'annonce générée par LLM | Cosmétique. N'augmente pas la confiance (qui est l'actif n°1) ni la conversion de façon prouvée. Risque juridique (specs inventées). |
| « Computer vision » sur photos de machines au lancement | Données d'entraînement labellisées inexistantes, coût GPU, faisabilité faible. Repoussé tant qu'on n'a pas un corpus `inspection_media` annoté. |
| Maintenance prédictive sur les machines vendues | On ne possède pas la télémétrie capteurs des engins. Donnée absente → fonction impossible. À ne pas promettre. |
| Pricing dynamique automatique (modif. du prix vendeur par l'IA) | Risque de manipulation de marché + rejet des vendeurs. On *estime* et on *ancre*, on ne fixe pas. |

---

## 2. Fonctions IA retenues (ROI élevé uniquement)

Pour chaque fonction : problème chiffré · données (tables/colonnes réelles) ·
MVP heuristique (implémentable maintenant) · ML roadmap · métrique · coût · ROI.
Toutes écrivent dans `ai_predictions`.

> Note sur les chiffres : pré-lancement, les volumes de litige/conversion sont des
> **hypothèses de cadrage** à valider, pas des mesures. Ils servent à prioriser et
> seront recalculés sur données réelles (c'est l'objet du point 4 du backlog produit).

---

### 2.1 `price_estimate_v1` — Estimation de prix  ⭐ PRIORITÉ 1

**Problème métier.** Sur les marketplaces d'équipement lourd, une annonce avec
fourchette de prix de référence convertit nettement mieux qu'une annonce « prix sur
demande » : l'ancrage lève l'incertitude de l'acheteur et accélère la mise en
relation (hypothèse de travail : facteur ~8x sur le taux de prise de contact, à
valider sur nos `platform_events`). Sans référentiel de prix, l'acheteur africain
n'a aucun moyen de juger si un prix EUR est juste pour une pelle 2015 à 9 000 h
importée — friction n°1 et terreau d'arnaque.

**Données (déjà modélisées).**
- `price_observations(machine_type, brand, model, year, hours_meter, country,
  condition, price_amount, price_currency, source, observed_at)` — le **référentiel
  propriétaire**. Index `idx_price_obs_lookup (machine_type, brand, model, year)`
  déjà présent → requête d'estimation rapide.
- Sources d'alimentation (colonne `source`) : `listing` (annonces),
  `sale` (ventes réelles = signal fort), `inspection` (via `inspection_reports`),
  `scraper`/`partner` (veille marché, monitor-service).
- `platform_events('machine_viewed','quote_requested')` pour mesurer l'effet
  conversion a posteriori.

**MVP heuristique (implémentable maintenant).**
1. Filtrer `price_observations` sur `(machine_type, brand, model)` puis fenêtre
   d'année `year ± 2`, même `country` si ≥ N points sinon zone régionale.
2. **Médiane** du `price_amount` (robuste aux outliers) + **bornes** = quantiles
   25/75 → `{estimate, low, high}`.
3. **Ajustement heures** : pente €/heure estimée par régression linéaire simple
   `price ~ hours_meter` sur le sous-échantillon (ou décote forfaitaire par palier
   d'heures si n trop faible). Ajustement `condition` (new/used/refurbished) par
   coefficient.
4. **Conversion devise** via le service de taux existant (`useExchangeRates` /
   `exchange-rates`) pour restituer en devise locale.
5. `confidence` = f(n observations, dispersion, fraîcheur `observed_at`). Si
   `n < seuil_min` (ex. 5) → on **n'affiche pas** d'estimation ponctuelle, seulement
   une fourchette large étiquetée « indicatif », et `confidence` bas. **Mieux vaut
   se taire que mentir.**
6. Écriture `ai_predictions(model='price_estimate_v1', subject_type='machine',
   subject_id, output={estimate,low,high,n,method:'median+hours_lr'}, confidence)`.

**ML roadmap.** Quand `price_observations` dépasse ~5–10k lignes par grande famille :
**gradient boosting** (XGBoost/LightGBM) features `[type, brand, model, year,
hours_meter, country, condition, age, source]`, entraîné en batch (worker Python du
monitor-service). On garde l'heuristique comme **fallback** et comme **baseline** à
battre (le ML doit prouver un gain de MAPE, sinon il ne sort pas).

**Métrique de succès.** MAPE de l'estimation vs `price_amount` réel des ventes
(`source='sale'`) ; et **uplift de conversion** (`quote_requested`/`machine_viewed`)
des annonces avec estimation vs sans (A/B via `platform_events`).

**Coût.** MVP ≈ une requête SQL agrégée + calcul Edge Function : **quasi nul**
(< 50 ms, pas de GPU, pas de LLM). ML : entraînement batch périodique CPU, coût
marginal. Coût donnée = l'ingestion `price_observations` (déjà au plan data).

**ROI.** Conversion (ancrage) → plus de devis → plus de GMV → plus de dossiers
financement (`finance_applications`) et d'escrow (`escrow_transactions`) = **LTV**.
C'est aussi la **brique d'entrée de la détection de fraude** (l'estimation est le
référentiel contre lequel on mesure l'aberration de prix). ROI le plus élevé du
portefeuille → **on commence par là**.

---

### 2.2 `fraud_score_v1` — Détection de fraude / annonce à risque  ⭐ PRIORITÉ 2

**Problème métier.** L'arnaque (faux acompte, prix anormalement bas pour appâter,
vendeur non vérifié, documents incohérents) est le **risque de réputation n°1** d'une
marketplace d'occasion en Afrique et le tueur de confiance — or la confiance est
l'actif défendable de MineGrid (cf. trust layer). Un seul litige viral détruit
l'acquisition. Objectif : signaler le risque **avant** mise en relation/escrow.

**Données (déjà modélisées).**
- `price_observations` → l'estimation `price_estimate_v1` sert de référence pour
  détecter l'**outlier de prix** (annonce 60 % sous l'estimation = drapeau rouge
  classique de l'arnaque « trop beau pour être vrai »).
- `trust_profiles(trust_score, trust_tier, verified_at)` +
  `verifications(kind, status)` → **absence de vérification** (identity,
  company_registration, bank_account non `approved`).
- `machine_history(event_type)` → incohérences (`price_change` brutaux répétés,
  absence de `inspected`, `dispute` antérieur).
- `platform_events` → **vélocité** : compte créé il y a 2 h publiant 15 annonces =
  signal de compte jetable.
- `inspection_reports(overall_grade, certified)` → un grade D/F ou l'absence
  d'inspection sur une annonce « premium » est incohérent.

**MVP heuristique = moteur de règles pondérées (implémentable maintenant).**
Score 0–100 = somme pondérée de signaux booléens/continus :

| Règle | Donnée source | Poids |
|---|---|---|
| Prix < (estimate − k·σ) | `price_observations` + `price_estimate_v1` | élevé |
| Aucune vérification `approved` | `verifications.status` | élevé |
| `trust_tier = 'unverified'` | `trust_profiles` | moyen |
| Vélocité création anormale | `platform_events` | moyen |
| Doc machine absent/incohérent | `verifications(kind='machine_document')`, `machine_history` | moyen |
| `dispute` antérieur | `machine_history.event_type` | élevé |

Sortie `ai_predictions(model='fraud_score_v1', subject_type='machine'|'seller',
output={risk:0-100, reasons:[...]}, confidence)`. **`reasons[]` est obligatoire** :
un score sans explication est inactionnable pour l'équipe trust et injuste pour le
vendeur. Seuil haut → revue manuelle / restriction escrow ; seuil moyen → demande de
vérification supplémentaire.

**ML roadmap.** **Anomaly detection** non supervisée (Isolation Forest) sur le
vecteur de features une fois assez d'historique, puis modèle supervisé quand on a
des labels de litige réels (issus de `escrow_transactions.status='disputed'` et
`machine_history.event_type='dispute'`). Les règles MVP **génèrent les premiers
labels** — c'est la boucle de démarrage à froid.

**Métrique.** Précision/rappel sur litiges confirmés (`status='disputed'`), taux de
faux positifs (vendeurs honnêtes bloqués — à minimiser, coût commercial), délai de
détection avant transaction.

**Coût.** MVP : règles SQL/Edge Function, **négligeable**, pas de LLM. ML : batch CPU.

**ROI.** Réduction des litiges et des remboursements escrow, protection de la marque
au lancement (quand un seul scandale peut tout arrêter), prime à la confiance qui
justifie la commission MineGrid. Dépend de `price_estimate_v1` → **vient juste après**.

---

### 2.3 `seller_score_v1` / `buyer_score_v1` — Scoring vendeur & acheteur

**Problème métier.** (a) Mettre en avant les vendeurs fiables (tri/badge) augmente la
conversion et l'auto-régulation du marché. (b) Le **scoring acheteur alimente le
financement** : `finance_applications.score` est attendu par le moteur serveur (cf.
0002) et conditionne la transmission au partenaire — sans porter le risque crédit
(règle d'or : MineGrid score puis transmet, ne prête jamais).

**Données.** `trust_profiles.trust_score` (socle, déjà calculé serveur),
`verifications` (complétude KYC), `machine_history` / `escrow_transactions`
(transactions abouties vs `disputed`/`refunded`), `platform_events` (ancienneté,
activité), `finance_applications.dossier` (pièces fournies) pour l'acheteur.

**MVP heuristique.** Fonction de combinaison du `trust_score` existant + bonus/malus :
+ transactions `released`, − `disputed`/`refunded`, + complétude vérifications, +
ancienneté. Tiers `unverified→elite` déjà dans `trust_profiles.trust_tier`. Pour le
financement : grille de scoring transparente (montant `amount`, durée `term_months`,
complétude `dossier`, score vendeur de la machine) → `finance_applications.score`.
Sortie tracée dans `ai_predictions(model='seller_score_v1'|'buyer_score_v1')`.

**ML roadmap.** Modèle de risque (régression logistique → boosting) prédisant la
probabilité de litige/défaut, une fois un historique de résultats suffisant. **On
reste explicable** : le financement exige une raison de refus (équité, conformité).
LLM proscrit ici.

**Métrique.** Corrélation score ↔ taux de litige réel ; pour la finance, taux
d'acceptation partenaire des dossiers transmis et taux de défaut rapporté.

**Coût.** Quasi nul (réutilise `trust_score`). **ROI.** Confiance, GMV financée
(commission d'apport finance), réduction du risque partenaire (rétention partenaires).

---

### 2.4 `match_score_v1` — Matching offre/demande

**Problème métier.** Les besoins d'équipement existent côté projets
(`market_projects` : appels d'offres mining/btp/energy, avec `budget_amount`,
`country`, `sector`) et côté `market_alerts` (requêtes utilisateurs sauvegardées).
Les relier au catalogue déclenche des mises en relation **proactives** (push d'offres
pertinentes) au lieu d'attendre une recherche — multiplie les opportunités de GMV sur
une base d'annonces et de projets déjà collectée.

**Données.** `market_projects(country, sector, budget_amount, phase)`,
`market_alerts.query` (jsonb `{country, sector, equipment_types, min_budget}`), le
catalogue `machines`, `price_observations` (compatibilité budgétaire via estimation).

**MVP heuristique = filtres pondérés.** Score de compatibilité = somme pondérée :
correspondance `machine_type`/`equipment_types`, proximité `country`/zone, fenêtre de
budget (`budget_amount` vs prix estimé), fraîcheur, secteur. Déclenche
`market_alerts` (canal email/whatsapp/in_app déjà prévu). Tracé dans
`ai_predictions(model='match_score_v1', subject_type='match')`.

**ML roadmap.** **Embeddings** (descriptions projets ↔ annonces) pour le matching
sémantique quand les filtres montrent leurs limites — c'est le **seul** endroit où un
modèle de langage (embeddings, pas LLM génératif) est justifié, et seulement en v2.

**Métrique.** Taux de clic/contact sur offres matchées, conversion alerte → devis.
**Coût.** MVP négligeable ; embeddings = coût d'inférence modéré, maîtrisé en batch.
**ROI.** Activation d'une demande latente déjà capturée → GMV incrémentale. Rappel
gouvernance : `market_projects` est un **service payant** (RLS abonnés actifs) — le
matching renforce la proposition de valeur de l'abonnement.

---

### 2.5 `reco_v1` — Recommandation d'équipements

**Problème métier.** Augmenter l'engagement et les pages vues par session
(« machines similaires », « les acheteurs de X ont regardé Y ») → plus de devis. Levier
d'engagement classique, faible risque.

**Données.** `platform_events('machine_viewed','quote_requested')` (co-visites,
co-occurrences) + attributs catalogue + `price_observations` pour la similarité de
gamme/prix.

**MVP heuristique.** (a) **Similarité par contenu** : même `machine_type`/`brand`,
`year`±, fourchette de prix proche. (b) **Co-visite** : « souvent vus ensemble » par
comptage simple sur `platform_events` (item-item basique). Pas de modèle lourd.

**ML roadmap.** Filtrage collaboratif (matrix factorization) une fois le volume
d'événements suffisant. Pas avant — sinon recommandations creuses (cold start).

**Métrique.** CTR des recommandations, pages/session, contribution aux devis.
**Coût.** Négligeable (comptages). **ROI.** Engagement → conversion. **Priorité basse**
(nice-to-have qui ne crée pas de confiance) : après prix, fraude, scoring.

---

### 2.6 `demand_forecast_v1` — Prédiction de demande

**Problème métier.** Aider à **prioriser l'offre** (quels types/marques sourcer,
dans quels pays) selon la saisonnalité et le pipeline projets. Oriente l'acquisition
d'annonces et la veille — décision business, pas gadget.

**Données.** Historique `platform_events` (recherches, vues, devis par
`machine_type`/`country`), `market_projects.phase`/`starts_at`/`budget_amount`
(pipeline financé/tender = demande future), saisonnalité observée.

**MVP heuristique.** Agrégats temporels : tendance + saisonnalité par
`(machine_type, country)` (moyennes mobiles) **pondérées par le pipeline projets**
(`market_projects` en phase `financed`/`tender`). Tableau de bord interne, sortie
`ai_predictions(model='demand_forecast_v1', subject_type='segment')`.

**ML roadmap.** Modèle de série temporelle (Prophet/SARIMA) quand l'historique
dépasse ~12–18 mois — **inutile avant** (pas assez de saisons observées). On l'assume.

**Métrique.** Erreur de prévision vs demande réalisée (devis), qualité des décisions
de sourcing. **Coût.** Faible (batch). **ROI.** Indirect (meilleur mix d'offre).
**Priorité la plus basse** — utile mais non bloquant au lancement.

---

## 3. Architecture

```
                ┌────────────────────────── DATA PLATFORM (actif propriétaire) ──┐
                │  price_observations · platform_events · machine_history        │
                │  trust_profiles/verifications · inspection_reports · escrow ·  │
                │  finance_applications · market_projects                         │
                └───────────────┬───────────────────────────┬────────────────────┘
                                │ (feature source)           │ (feature source)
        ┌───────────────────────▼─────────┐        ┌─────────▼───────────────────┐
        │  INFÉRENCE LÉGÈRE (temps réel)   │        │  RÉENTRAÎNEMENT / BATCH       │
        │  Supabase Edge Functions (Deno)  │        │  Workers Python               │
        │  + RPC Postgres sous service_role│        │  (monitor-service, FastAPI)   │
        │  price_estimate / fraud / score  │        │  gradient boosting, anomaly,  │
        │  match / reco                    │        │  embeddings, forecast         │
        └───────────────┬──────────────────┘        └─────────┬─────────────────────┘
                        │  write                               │  write
                        └──────────────┬───────────────────────┘
                                       ▼
                          ai_predictions (TRAÇABILITÉ)
                          model · subject · output(jsonb) · confidence
```

- **Inférence légère = Edge Function Deno + RPC Postgres** (le stack déjà en place,
  cf. `supabase/functions/`). Estimation, fraude, scoring, matching, reco
  s'exécutent en quelques ms, sans GPU. Sorties calculées sous **`service_role`**
  (les tables sensibles sont deny-by-default côté client : `price_observations` n'a
  aucune policy SELECT, `ai_predictions` est interne).
- **Réentraînement = workers batch Python** dans le **monitor-service** existant
  (FastAPI/Postgres/Docker déjà là pour l'intelligence marché). C'est là que vivent
  XGBoost/Isolation Forest/embeddings/forecast, déclenchés périodiquement (cron). Les
  artefacts de modèle sont versionnés ; l'Edge Function charge les coefficients/seuils.
- **Feature source = la Data Platform** (`price_observations`, `platform_events`,
  trust/inspection/escrow/finance). `platform_events` (append-only) est la matière
  première : **instrumenter tôt** est la condition de tout le ML futur.
- **Exposition** : aucune table d'IA en lecture directe client. Le front consomme des
  **RPC d'estimation/score**, jamais les observations brutes — modèle économique (la
  donnée propriétaire ne fuit pas) et sécurité alignés.

---

## 4. Séquencement

L'ordre suit le ROI et les **dépendances de données** (la fraude a besoin de
l'estimation ; tout a besoin d'événements).

| Phase | Fonction | Pré-requis | Pourquoi à ce moment |
|---|---|---|---|
| **0 — Fondation** | Instrumenter `platform_events` + alimenter `price_observations` (listing/sale/scraper) | Schéma 0003 déjà déployé | Sans données, aucune IA. Carburant de tout le reste. |
| **1** | `price_estimate_v1` (heuristique) | Phase 0 | ROI n°1 (conversion + ancrage), brique de la fraude, faisabilité immédiate. |
| **2** | `fraud_score_v1` (règles) | Phase 1 (référence prix) | Protège la confiance/réputation dès les premières transactions. |
| **3** | `seller_score_v1` / `buyer_score_v1` | `trust_score` + historique | Active le financement (`finance_applications.score`) et le tri vendeurs. |
| **4** | `match_score_v1` (filtres) | `market_projects`/`market_alerts` peuplés | Active la demande captée ; renforce l'abonnement veille. |
| **5** | `reco_v1`, `demand_forecast_v1` | Volume d'événements/saisons | Engagement et sourcing — utiles, non bloquants. |
| **R** | Bascule ML (boosting, anomaly, embeddings, forecast) | Seuils de volume atteints **et** gain prouvé vs heuristique | Le ML ne sort que s'il bat la baseline mesurée. |

**Règle de promotion heuristique → ML :** un modèle ML ne remplace une heuristique
que s'il démontre un gain sur la métrique (MAPE, précision/rappel) en backtest, sinon
on garde la règle (plus simple, explicable, gratuite).

---

## 5. Risques & parades

| Risque | Parade |
|---|---|
| **Données insuffisantes au lancement** (cold start) | On **commence en heuristique** (médiane, règles, filtres). Pas de ML tant que les seuils de volume ne sont pas atteints. `confidence` bas + non-affichage si `n` trop faible — **on se tait plutôt que de mentir**. |
| **Biais** (géographique, par marque, contre petits vendeurs) | Médiane (robuste), seuils minimaux par segment, suivi des taux de faux positifs fraude par pays/tier, `reasons[]` auditables. Pas de blocage automatique sans revue humaine sur les scores sensibles. |
| **Coût LLM injustifié** | LLM **interdit** là où une statistique suffit (prix, scoring). Réservé au langage non structuré (résumé inspection, extraction PDF douane), et seulement en roadmap. Inférence cœur = SQL/Edge, coût ~0. |
| **Fraude inactionnable** | `reasons[]` obligatoire dans `output` ; seuils → action (revue, vérif, restriction escrow), pas un nombre nu. |
| **Manipulation du référentiel prix** (injection d'observations bidon) | `source` typée, pondération des ventes réelles (`sale`) > annonces, écriture `price_observations` réservée `service_role`, détection d'outliers en entrée. |
| **Dérive de modèle** (drift) | Réentraînement batch périodique + suivi MAPE/précision dans le temps via `ai_predictions` (backtest sur sorties historiques). |
| **Bus-factor 1 / opacité** | Heuristiques **lisibles** et versionnées (`*_v1`), tout tracé dans `ai_predictions` → reproductible et reprenable sans le concepteur initial. |
| **Conformité financement** | Scoring acheteur **explicable** (raison de refus), MineGrid **ne porte aucun risque crédit** (score puis transmet) — aligné sur la règle d'or du module finance. |

---

## 6. Angle investisseur — pourquoi cette IA est défendable

- **Ce n'est pas un wrapper LLM.** N'importe qui branche GPT en un week-end ; ça ne
  crée aucune barrière. La valeur de MineGrid est l'**actif data propriétaire** :
  `price_observations` (prix d'occasion réels, par modèle/année/heures/pays africain —
  une donnée que *personne* ne possède sur ce marché), `platform_events`,
  `inspection_reports` certifiés, historique `escrow`/litiges. Les modèles sont
  entraînés sur cette donnée — **le moat est la donnée, pas l'algorithme.**
- **Boucle de données auto-renforçante.** Plus de transactions → plus de prix
  observés et de labels de litige → meilleures estimations et meilleure détection de
  fraude → plus de confiance → plus de transactions. Avantage **cumulatif** et
  difficile à rattraper pour un nouvel entrant.
- **L'IA renforce l'actif n°1 (la confiance), elle ne le remplace pas.** Estimation
  (ancrage), fraude (protection), scoring (financement) servent directement le *trust
  layer* — l'espace défendable identifié, pas le simple listing.
- **Discipline du capital.** On commence en heuristique (coût quasi nul), on ne paie
  du ML/GPU que lorsque le volume le justifie et que le gain est prouvé. Pas de coût
  LLM récurrent caché. Une IA **traçable** (`ai_predictions`), explicable et auditable
  — crédible en due diligence, pas une boîte noire marketing.
- **Honnêteté MVP vs roadmap.** On assume que le lancement est heuristique ; le ML est
  une trajectoire crédible et chiffrée (seuils, métriques), pas une promesse de façade.
