# MineGrid Data — la plateforme de données comme actif propriétaire

> Statut : **pré-lancement**. Ce document distingue strictement ce qui **existe** (schéma SQL
> `sql/nextgen/0003_logistics_intelligence_data.sql`, connecteurs du `monitor-service`) de ce qui
> est **à construire** (RPC d'estimation, features, modèles). Pas de façade.
> Audience : direction, investisseurs, équipe data/ingénierie.
> Propriétaire : Chief Data Officer.

---

## 1. Vision — la donnée est l'actif n°1 défendable

MineGrid n'est pas (seulement) une place de marché d'engins lourds. Une place de marché se copie :
des annonces, des photos, un moteur de recherche. Ce qui ne se copie pas, c'est **le référentiel
propriétaire de prix d'occasion réellement observés** sur le marché ouest/centre-africain
francophone, enrichi du **journal de tous les événements** de la plateforme et des **sorties des
modèles** qui s'en nourrissent.

C'est ce référentiel — `price_observations` + `platform_events` + `ai_predictions` — qui rend
possibles les trois fonctions qui créent de la confiance et donc de la transaction :

1. **Estimation de prix** (« cette pelle de 2016 à 9 800 h vaut entre X et Y au Sénégal »),
2. **Scoring** (vendeur, machine, dossier) pour fluidifier l'escrow et le financement,
3. **Détection de fraude** (prix aberrant, annonce dupliquée, kilométrage incohérent).

**Pourquoi Via Mobilis (MachineryZone) et Mascus ne l'ont pas ici.** Ces acteurs dominent l'annonce
en Europe, mais leur donnée de **prix transactionnel africain** est quasi inexistante : leurs prix
sont des prix *d'affichage européens*, libellés en EUR, sur des machines qui n'ont jamais roulé en
Afrique de l'Ouest, sans coût rendu (CIF + douane), sans la décote/surcote locale (rareté pièces,
climat, financement cher). Le marché de l'occasion africain est **opaque, multi-devises
(XOF/XAF/USD/EUR/MAD), informel et fragmenté**. Personne n'a aujourd'hui le référentiel de **prix
rendus, observés localement**. Celui qui le constitue le premier construit une barrière qui grandit
toute seule (section 5).

**La thèse en une phrase :** une place de marché vaut ses annonces ; **MineGrid vaudra ses
données**. Les annonces sont un produit d'appel ; le référentiel de prix est l'actif qui s'apprécie.

---

## 2. Modèle de données — trois tables, event sourcing, deny par défaut

Réel, déjà créé dans `sql/nextgen/0003_logistics_intelligence_data.sql`. Trois tables forment le
cœur de la plateforme. Conception : **append-only** (on n'écrase pas l'histoire), **deny par
défaut** côté client (la valeur sort par RPC, jamais par lecture brute).

### 2.1 `price_observations` — le référentiel de prix (l'actif)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid | clé |
| `machine_type` | text | `pelle`, `chargeuse`, `bulldozer`, `niveleuse`… |
| `brand` | text | marque (à normaliser, cf. §6) |
| `model` | text | modèle (à normaliser) |
| `year` | int | millésime (`1950 ≤ year ≤ 2100`) |
| `hours_meter` | int | compteur horaire — déterminant majeur du prix |
| `country` | text | pays d'observation (le prix rendu dépend du pays) |
| `condition` | text | `new` / `used` / `refurbished` |
| `price_amount` | numeric(14,2) | montant (`≥ 0`) |
| `price_currency` | text | devise d'observation (XOF/XAF/USD/EUR/MAD…) |
| `source` | text | `listing` / `sale` / `inspection` / `partner` / `scraper` |
| `observed_at` | timestamptz | date d'observation (≠ date d'insertion) |

Un enregistrement = **un prix, pour une machine, à une date, dans un pays, via une source**. La
qualité du signal dépend de `source` : une **vente réelle** (`sale`) ou une **inspection**
(`inspection`) vaut plus qu'un **prix d'affichage** (`listing`/`scraper`) — ce poids est exploité à
l'estimation (§4, §6).

Index existants : `(machine_type, brand, model, year)` pour le lookup d'estimation ;
`(country, observed_at desc)` pour la fraîcheur par pays.

### 2.2 `platform_events` — journal d'événements append-only (event sourcing)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid | clé |
| `event_name` | text | `machine_viewed`, `quote_requested`, `inspection_passed`… |
| `subject_type` | text | `machine` / `seller` / `buyer` / `transaction` |
| `subject_id` | uuid | sujet concerné |
| `actor_id` | uuid | auteur (FK `auth.users`, nullable = anonyme/système) |
| `props` | jsonb | charge utile contextuelle |
| `created_at` | timestamptz | horodatage |

**Event sourcing** : on n'enregistre pas un état muté, on enregistre **le flux des faits**. Cette
table est la **matière première** : les agrégats, les features IA et les KPI se *dérivent* du flux,
ils ne le remplacent pas. Avantage décisif : on peut **recalculer** une feature ou un KPI a
posteriori sur tout l'historique, parce que le fait brut n'a jamais été écrasé.

### 2.3 `ai_predictions` — sorties de modèles, traçables (interne)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid | clé |
| `model` | text | `price_estimate_v1`, `fraud_score_v1`, `seller_score_v1`… |
| `subject_type` / `subject_id` | text / uuid | sujet scoré |
| `output` | jsonb | ex. `{estimate, low, high}` ou `{risk, reasons[]}` |
| `confidence` | numeric(4,3) | confiance du modèle |
| `created_at` | timestamptz | horodatage |

Chaque prédiction est **versionnée par `model`** et **horodatée** : on sait toujours quel modèle a
produit quelle sortie, quand, avec quelle confiance — indispensable pour l'audit, la reproductibilité
et la conformité (§9).

### 2.4 Posture de sécurité (réelle, dans le SQL)

- RLS activé sur les trois tables.
- `price_observations` : **aucune policy SELECT client → deny par défaut**. En plus,
  `revoke select, insert, update, delete … from anon` ferme l'anonyme explicitement. La valeur
  n'est **jamais** lue en table par le client : elle sort par **RPC d'estimation** (§4).
- `platform_events` / `ai_predictions` : **internes, deny par défaut**, accès `service_role`
  uniquement. L'écriture des événements passe par le backend de confiance, pas par le client.

> Conséquence directe de la règle interne : **les données sensibles sortent en agrégat/RPC, jamais
> en lecture brute.** Le schéma applique déjà cette règle pour `price_observations`.

---

## 3. Sources d'alimentation — comment le référentiel se remplit

Le principe : **tout signal de prix ou de comportement est capté**. Trois familles de sources
alimentent `price_observations` ; toute interaction alimente `platform_events`.

### 3.1 Vers `price_observations` (le prix)

| Origine | `source` | Statut | Qualité du signal |
|---|---|---|---|
| Annonces publiées sur MineGrid | `listing` | à brancher (MVP) | moyen (prix demandé) |
| **Ventes conclues via escrow** | `sale` | à brancher (MVP) | **élevé (prix réel)** |
| Rapports d'inspection terrain | `inspection` | à brancher (roadmap proche) | élevé (état vérifié) |
| Partenaires (concessionnaires, OEM, loueurs) | `partner` | roadmap | élevé (selon partenaire) |
| Scraping marché (Mascus, Leboncoin, portails) | `scraper` | **connecteurs existants** | moyen (prix d'affichage) |

État réel à date :
- Le `monitor-service` possède **déjà** des connecteurs d'ingestion
  (`app/ingestion/connectors/` : `mascus`, `leboncoin`, `public_portals`, flux OCDS, données
  Banque mondiale/PPI). Ils alimentent aujourd'hui la **veille marché** (`market_projects`) et le
  catalogue machines.
- **Ce qui n'existe pas encore** : le pont qui transforme ces ingestions et les événements
  transactionnels en lignes `price_observations`. C'est le **premier livrable du MVP data** (§10) :
  un *normaliseur* qui, pour chaque annonce/vente/scrape, écrit une observation typée et déduplée.

### 3.2 Vers `platform_events` (le comportement)

Chaque interaction porteuse de signal est journalisée côté backend de confiance :
`machine_viewed`, `quote_requested`, `inspection_passed`, `escrow_opened`, `deal_closed`, etc.
Ce flux sert à la fois aux KPI produit, aux features IA (intensité de demande par modèle/pays) et à
la détection de fraude (rythmes anormaux).

### 3.3 Ingestion via `monitor-service`

Le `monitor-service` (FastAPI + Postgres/Supabase, déjà en place) est le **point d'entrée
d'ingestion** : connecteurs sources, `fingerprint` de déduplication, `upsert`. Cible
d'architecture : il écrit les observations de prix **côté `service_role`** dans
`price_observations` (respect du deny par défaut — jamais via le client).

---

## 4. Gouvernance & exposition — jamais de dump, toujours de l'agrégat

Règle non négociable : **on n'expose jamais la table brute**. La donnée crée de la valeur
**sans jamais fuiter l'observation individuelle** (qui pourrait révéler un prix de transaction
nominatif → risque concurrentiel *et* RGPD).

### 4.1 Le contrat d'exposition : `estimate_price(...)`

Fonction `SECURITY DEFINER` (s'exécute avec les droits du propriétaire, donc peut lire
`price_observations` que le client ne peut pas lire), **à créer** (MVP) :

```
estimate_price(p_machine_type, p_brand, p_model, p_year, p_country)
  → { estimate, low, high, n }
```

- `estimate` : médiane (robuste aux valeurs extrêmes — cf. §6) des observations comparables ;
- `low` / `high` : bornes (p. ex. P25 / P75) = fourchette honnête, pas un faux point unique ;
- `n` : **nombre d'observations** ayant servi au calcul = mesure de confiance affichée à
  l'utilisateur. **Si `n` est trop faible, on le dit** (« estimation indicative, peu de données »)
  plutôt que d'inventer un chiffre précis. Pas de façade jusque dans l'UI.

Garde-fous de la fonction :
- **Seuil minimum d'observations (k-anonymat de marché)** : sous un `n` plancher (p. ex. < 5), la
  fonction renvoie une fourchette élargie ou un signal « données insuffisantes », **jamais** un
  chiffre qui laisserait deviner une transaction unique.
- **Fenêtre de fraîcheur** : pondération/filtre par `observed_at` (une obs de 2019 pèse moins).
- **Conversion de devises** : normalisation vers une devise pivot avant agrégat (§6).
- **Grants explicites** : `execute` accordé au rôle applicatif ; la table reste fermée.

### 4.2 Anonymisation & rétention

- Les RPC ne renvoient **que des agrégats** ; aucune ligne, aucun identifiant de vendeur/acheteur,
  aucun `id` d'observation ne sort.
- `price_observations` est **dépersonnalisé par construction** : il ne stocke pas l'identité du
  vendeur/acheteur, seulement les attributs machine + prix + pays + source.
- `platform_events.actor_id` (donnée personnelle) reste **interne** et fait l'objet d'une politique
  de **rétention** et de **minimisation** (§9). Les agrégats dérivés sont conservés ; les liens
  nominatifs sont purgés au terme de la durée définie.

---

## 5. Effet réseau de données — la boucle qui s'auto-renforce

C'est le cœur de la défendabilité. Contrairement à un effet réseau classique (plus d'utilisateurs →
plus de valeur), ici c'est un **effet de données** : la valeur croît avec le **volume et la qualité
des observations**, pas seulement avec le nombre d'utilisateurs.

```
        ┌─────────────────────────────────────────────────────────┐
        │                                                         │
        ▼                                                         │
  Plus de transactions / annonces / inspections                  │
        │                                                         │
        ▼                                                         │
  Plus d'observations de prix (price_observations)               │
  + plus d'événements (platform_events)                          │
        │                                                         │
        ▼                                                         │
  Meilleures données : couverture ↑, fraîcheur ↑, signal `sale` ↑│
        │                                                         │
        ▼                                                         │
  Meilleurs modèles : estimation plus juste, fraude mieux        │
  détectée, scoring plus fiable                                  │
        │                                                         │
        ▼                                                         │
  Plus de confiance : acheteurs/vendeurs/financeurs s'engagent   │
        │                                                         │
        └─────────────────────────────────────────────────────────┘
                 (et le cycle recommence, en s'amplifiant)
```

Pourquoi c'est une **barrière qui grandit** : un nouvel entrant démarre à `n = 0`. Même avec plus de
capital, il ne peut pas *acheter* l'historique des prix rendus africains — il doit le **vivre**,
transaction après transaction. Chaque mois d'avance de MineGrid creuse l'écart de couverture et de
fraîcheur. **L'actif s'apprécie pendant que le concurrent stagne.**

---

## 6. Qualité des données — sans laquelle l'estimation ment

Une estimation n'est crédible que si la donnée est propre. Chantiers (la plupart **à construire**,
le schéma fournit déjà les crochets : index de lookup, `source`, `fingerprint` côté monitor) :

- **Déduplication.** Une même machine apparaît sur plusieurs sources / plusieurs jours. On déduplique
  par empreinte (marque+modèle+année+heures+pays+fenêtre temporelle) — le `monitor-service` a déjà un
  module `fingerprint` à étendre aux observations de prix.
- **Normalisation marques/modèles.** `CAT` = `Caterpillar` ; `JCB 3CX` vs `3 CX`. Table de
  correspondance (référentiel canonique) pour que les comparables soient réellement comparables.
- **Détection d'outliers prix.** Filtrage statistique (écart interquartile / z-score robuste) pour
  écarter les saisies aberrantes et les arnaques. Un outlier n'est pas qu'un bruit : c'est aussi un
  **signal de fraude** (alimente `fraud_score_v1`).
- **Devises.** Conversion vers une devise pivot via taux datés (le repo a déjà une logique de taux de
  change / `exchange_rates`) **avant** tout agrégat. On ne mélange jamais XOF et EUR bruts.
- **Pondération par source & fraîcheur.** `sale`/`inspection` > `listing`/`scraper` ; obs récente >
  obs ancienne. La médiane est préférée à la moyenne (robustesse aux extrêmes résiduels).

---

## 7. Pipeline — collecte → nettoyage → agrégats → features

```
  SOURCES                COLLECTE            NETTOYAGE           AGRÉGATS / SERVING        IA
  ───────                ────────            ─────────           ──────────────────        ──
  annonces MineGrid ─┐
  ventes (escrow)   ─┤   monitor-service     dédup +             vues/medianes par    ┌─ estimate_price()
  inspections       ─┼─▶ (connecteurs,  ─▶   normalisation ─▶    (type,marque,modèle, ┤   (RPC, SECURITY
  partenaires       ─┤   fingerprint,        + devises +         année,pays)          │    DEFINER)
  scraping (Mascus, ─┘   upsert)             outliers            + features dérivées  └─ ai_predictions
   Leboncoin, OCDS…)                                              des platform_events     (price/fraud/seller)

  interactions UI ─────▶ platform_events (append-only) ──────────────┘ (temps réel)
```

Deux régimes complémentaires :
- **Batch** : recalcul périodique des agrégats et des features sur tout l'historique (possible
  *parce que* l'event log est append-only — §2.2).
- **Temps réel** : les `platform_events` arrivent en flux ; les compteurs de demande
  (vues/devis par modèle/pays) et les déclencheurs de fraude se mettent à jour à chaud.

État : la couche **collecte** existe (monitor-service) ; **nettoyage → agrégats → features → RPC**
sont à construire (MVP/roadmap, §10).

---

## 8. KPIs de la plateforme de données

On pilote l'actif, pas seulement le produit. Indicateurs cibles :

| KPI | Définition | Pourquoi |
|---|---|---|
| **Volume d'observations** | nb lignes `price_observations`, total et /mois | taille de l'actif, vitesse d'accumulation |
| **Part de signal fort** | % d'obs `sale` + `inspection` | un référentiel de *prix réels* > prix d'affichage |
| **Couverture par type/pays** | nb de couples (type, pays) avec `n ≥ k` | combien de requêtes on sait estimer honnêtement |
| **Fraîcheur** | médiane de l'âge (`now − observed_at`) par segment | une donnée périmée fait mentir l'estimation |
| **Précision d'estimation** | erreur (MAPE) estimation vs prix de vente réel | la seule mesure qui compte pour la confiance |
| **Taux de couverture des requêtes** | % de demandes d'estimation servies avec `n ≥ k` | mesure le « trou » de données à combler |
| **Volume d'événements** | `platform_events`/jour, par `event_name` | santé du flux event-sourcing |

La **précision** se mesure en rejouant les estimations passées contre les ventes effectivement
conclues (`source = 'sale'`) — boucle de validation honnête, pas auto-déclarée.

---

## 9. Conformité — RGPD & loi 09-08 (Maroc), PII

Cadre : **RGPD** (utilisateurs UE / vendeurs européens à l'export) et **loi 09-08** (protection des
données personnelles, Maroc) pour les opérations Maghreb. Principes appliqués :

- **Minimisation.** `price_observations` est **dépersonnalisé par conception** : attributs machine +
  prix + pays + source, **pas d'identité**. C'est la table qui s'apprécie ; elle ne contient pas de
  PII. C'est volontaire.
- **Donnée personnelle isolée.** La seule PII directe du périmètre data est `platform_events.actor_id`
  (et le contenu éventuel de `props`). Elle reste **interne**, jamais exposée par RPC, soumise à
  rétention.
- **Base légale.** Événements liés à l'exécution du service (transaction, devis) : **exécution du
  contrat / intérêt légitime** ; sollicitations marketing : **consentement** distinct et révocable.
- **Droits des personnes.** Accès / rectification / effacement : l'`actor_id` permet de retrouver et
  purger les événements d'une personne **sans détruire les agrégats** (qui, eux, sont anonymes et
  conservables).
- **Exposition contrôlée.** Le deny par défaut + RPC agrégés + seuil `n` minimum garantissent qu'**on
  ne peut pas ré-identifier** une transaction via une estimation trop fine (§4.1).
- **Souveraineté & rétention.** Hébergement et durées de conservation documentés ; politique de
  rétention par catégorie (faits bruts vs agrégats dérivés).

---

## 10. MVP vs roadmap — pas de façade

**MVP (à livrer en premier, périmètre volontairement étroit) :**
1. Brancher l'alimentation `price_observations` depuis (a) les **annonces MineGrid**, (b) les
   **ventes escrow** (`source='sale'`), (c) les **connecteurs scraping existants** du monitor-service.
2. Normalisation minimale : devise pivot + dédup de base + table de correspondance marques.
3. **Un seul RPC** : `estimate_price(...)` par **médiane** des comparables, avec `low/high/n` et
   **seuil `n` minimum**. Honnête sur l'incertitude.
4. Journaliser les `platform_events` clés (`machine_viewed`, `quote_requested`, `deal_closed`).

> Ce qui n'existe PAS encore aujourd'hui (à ne pas présenter comme acquis) : la fonction
> `estimate_price`, le normaliseur d'observations, le store de features, tout modèle ML.

**Roadmap :**
- **Feature store** dérivé de `platform_events` (intensité de demande, vélocité de vente par segment).
- **Modèles ML** : `price_estimate_v1` (régression au-delà de la simple médiane), `fraud_score_v1`,
  `seller_score_v1` — tous traçés dans `ai_predictions`.
- **Data products vendables** (§11) aux OEM, assureurs, banques.
- Connecteurs partenaires (`source='partner'`), ingestion inspections terrain à grande échelle.

---

## 11. Monétisation de la donnée — un nouveau flux de revenu

Une fois le référentiel constitué, il devient **vendable** (en agrégat, jamais en brut) :

- **Rapports de marché** (B2B) : indices de prix par type/pays/trimestre, tendances de décote,
  vendus aux concessionnaires, loueurs, OEM. Produit dérivé direct des agrégats §4.
- **API « prix » pour assureurs & financiers** : valeur résiduelle / valeur à neuf pour tarifer une
  assurance ou dimensionner un crédit/leasing. Le scoring + l'estimation deviennent un **service
  facturé à l'appel** — exactement le type de donnée que **personne d'autre n'a** sur ce marché.
- **Benchmarks OEM** : à quel prix et à quelle vitesse se revend telle marque/modèle en Afrique de
  l'Ouest — un OEM paie pour le savoir.

Principe inchangé : on vend **l'agrégat et l'insight**, jamais l'observation individuelle ni la PII.
La monétisation **n'affaiblit pas** le moat, elle le **finance**.

---

## 12. Moat & lecture investisseur

- **Actif composable qui s'apprécie.** `price_observations` + `platform_events` + `ai_predictions`
  forment un actif qui **prend de la valeur avec le temps** : chaque transaction l'enrichit, et la
  conception event-sourcing permet de **recréer** features et modèles futurs sur tout l'historique —
  on capitalise aujourd'hui une donnée dont on n'a pas encore inventé tous les usages.
- **Barrière à l'entrée croissante.** Le coût de rattrapage pour un concurrent **augmente** chaque
  mois (couverture + fraîcheur impossibles à acheter, seulement à vivre). C'est l'inverse d'un
  produit copiable.
- **Optionalité de revenu.** Le même actif sert le cœur (confiance → transaction) **et** ouvre des
  revenus data (rapports, API assureurs/financiers) sans cannibaliser le cœur.
- **Honnêteté du stade.** À date : le **schéma et la posture de sécurité existent** (deny par défaut,
  internalisation des PII, RLS), la **collecte source existe** (monitor-service) ; l'**estimation et
  les modèles sont à construire** (§10). La valeur n'est pas dans une démo : elle est dans la
  **trajectoire d'accumulation** d'un actif que les places de marché concurrentes n'ont pas sur ce
  marché.

> **En une ligne pour le board :** MineGrid construit, transaction après transaction, le seul
> référentiel de **prix rendus d'engins d'occasion en Afrique francophone** — un actif propriétaire,
> conforme, qui s'auto-renforce et devient une barrière, *puis* une ligne de revenu.
