# MineGrid Intelligence — Veille marché (appels d'offres & projets miniers/BTP)

> **Module 8 du plan NextGen** (cf. `NEXTGEN_TRANSFORMATION.md` §3, actif n°6).
> Statut : **schéma livré** (`sql/nextgen/0003_logistics_intelligence_data.sql`)
> + **moteur d'ingestion réel existant** (`services/monitor-service/`, FastAPI).
> NextGen **consomme** ce moteur via deux tables exposées proprement (`market_projects`,
> `market_alerts`). Ce document distingue strictement **MVP** (livrable court terme)
> et **roadmap** (à construire) — règle anti-façade héritée de l'audit.

---

## 1. Problème & thèse

**Le problème terrain.** Un sous-traitant minier ou BTP en Afrique francophone (loueur
d'engins, entreprise de terrassement, négociant de matériel) gagne ou perd son année sur
une question : *quels chantiers démarrent près de moi, et avec quel budget ?* Un nouveau
projet financé = une demande d'engins (pelles, chargeuses, bulldozers, camions, foreuses).
Mais l'information est **dispersée** : portails de marchés publics pays par pays, avis des
bailleurs (Banque mondiale, BAD, BID), annonces de financement, presse spécialisée. Personne
n'a le temps de surveiller 35 sources dans 6 langues administratives.

**La demande est tirée par un pipeline réel** (pas une projection marketing) :

| Projet | Pays | Budget | Lecture engins |
|---|---|---|---|
| Simandou (fer) | Guinée | ~20 Md$ | terrassement, voie ferrée, port — flotte massive |
| PND 2021-2025 | Côte d'Ivoire | ~206 Md$ (plan national) | routes, ouvrages, BTP — sous-traitance large |
| Mondial 2030 | Maroc | stades, routes, rail, hôtellerie | pic de demande BTP 2025-2030 |
| Kamoa-Kakula (cuivre) | RDC | extension continue | engins miniers, énergie |

**La thèse.** MineGrid n'est pas « un site d'annonces » (marché perdant — cf. la thèse
du repositionnement NextGen). MineGrid est l'**infrastructure de confiance et de décision**
des équipements lourds. La veille marché est la **porte d'entrée amont** : elle dit à un Pro
*où sera la demande d'engins*, **avant** que le besoin ne devienne une recherche dans un
catalogue. C'est un **driver d'abonnement** (le Pro paie pour l'information) et un **driver
de leads** (le projet repéré devient une vente d'engins ou un service MineGrid).

**Leçon de l'audit (correctif structurel).** La veille est un **service payant**, réservé
aux abonnés actifs. L'audit a relevé un accès trop permissif ; ici la garde est posée
**deux fois** : au niveau base (RLS sur `market_projects`) et au niveau API
(`require_paid_user_or_admin`). Pas d'accès gratuit aux données projet.

---

## 2. Modèle de données

Deux tables NextGen (migration `0003`, déjà écrite), alimentées par le monitor-service.

### `market_projects` — le référentiel projets (consommé en lecture par les abonnés)

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `source` | text | portail public, scraper, partenaire (traçabilité) |
| `country` | text | pays du projet |
| `sector` | text | `mining` / `btp` / `energy` / `infrastructure` / `other` (CHECK) |
| `title` | text NOT NULL | intitulé de l'AO / projet |
| `description` | text | résumé |
| `budget_amount` | numeric(16,2) | montant |
| `budget_currency` | text | défaut `USD` |
| `phase` | text | `study` / `financed` / `tender` / `construction` / `operation` (CHECK) |
| `lat` / `lng` | double precision | géocodage (carte Leaflet) |
| `starts_at` | date | démarrage prévu |
| `contacts` | jsonb | `[]` par défaut — maître d'ouvrage, point de contact AO |
| `fingerprint` | text **UNIQUE** | clé de déduplication multi-sources |
| `created_at` | timestamptz | `now()` |

Index : `idx_market_projects_country (country, sector)` — filtres dashboard.

### `market_alerts` — les requêtes de veille sauvegardées (propriété utilisateur)

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK `auth.users`, `on delete cascade` |
| `query` | jsonb | `{country, sector, equipment_types, min_budget}` |
| `channel` | text | `email` / `whatsapp` / `in_app` (CHECK), défaut `email` |
| `active` | boolean | défaut `true` |
| `created_at` | timestamptz | |

Index : `idx_market_alerts_user (user_id)`.

### Lien avec le monitor-service

Le monitor-service possède **sa propre base** (modèle SQLAlchemy `Project`, plus riche :
documents, entités, contacts, besoins en engins déjà calculés). `market_projects` est la
**projection exposée** dans Postgres/Supabase de NextGen : un sous-ensemble normalisé,
géocodé et dédupliqué, sur lequel s'appliquent RLS et abonnement. **Le client NextGen ne
parle jamais directement au monitor** ; il lit `market_projects` (RLS) ou appelle une Edge
Function qui relaie vers l'API FastAPI protégée.

```
monitor-service (Postgres interne, riche)  ──projection normalisée──►  market_projects (Supabase, RLS abonnés)
        ▲ ingestion ~35 sources                                              ▲ lecture abonnés / alertes
```

---

## 3. Architecture d'ingestion (le moteur réel)

Le moteur existe déjà : `services/monitor-service/` (FastAPI + APScheduler + SQLAlchemy
async). Pipeline en quatre temps.

**1) Collecte (connecteurs).** Registre `app/ingestion/registry.py`, config déclarative
`sources.yaml`. Connecteurs réels en place (`CONNECTOR_MAP`) :

| Connecteur | Type de source | Légalité |
|---|---|---|
| `wb_data360` | API World Bank Data360 (indices infra Afrique) | **API officielle** ✅ |
| `mdb_procurement` | Avis Banque mondiale / BAD / BID (RSS/Atom/JSON) | **sources officielles bailleurs** ✅ |
| `ocds_feed` | Flux Open Contracting (OCDS) standardisé | **standard ouvert** ✅ |
| `ppi` | CSV PPI World Bank + seed minier multi-pays | **données publiées** ✅ |
| `public_portals` | Portails marchés publics nationaux (HTML) | **officiels, à encadrer** ⚠️ |
| `mascus` / `leboncoin` | Annonces d'occasion (alimentent surtout `price_observations`) | **CGU à respecter** ⚠️ |

`sources.yaml` liste aujourd'hui ~30 portails publics nationaux (Maroc `marchespublics.gov.ma`,
Sénégal `marches.senegalpme.sn` + ARCOP, Côte d'Ivoire `marchespublics.ci`, Cameroun, Nigéria
BPP/NOCOPO, Ghana PPA, Burkina/Mali/Niger/Guinée/Bénin/Togo ARMP/DGMP, Algérie, Tunisie TUNEPS,
Égypte, Golfe Etimad/Monaqasat, UE TED/BOAMP…) **plus** les trois guichets MDB (WB/AfDB/IsDB)
déclinés par secteur (infra/énergie/mine).

**2) Normalisation.** Chaque connecteur produit un `ProjectAsset` homogène (titre, pays,
secteur, phase, budget, contacts), puis **géocodage** (`app/geocoder.py`) pour `lat`/`lng`.
Un moteur de règles (`app/rules/engine.py`) en déduit les **besoins en engins** par type de
projet et phase (atout pour le croisement catalogue, roadmap §9).

**3) Déduplication par `fingerprint`.** Implémentation réelle `app/ingestion/fingerprint.py` :
normalisation Unicode/casse/ponctuation puis `sha256` sur
`title | country | region | phase | source | url`. La contrainte **UNIQUE** sur
`market_projects.fingerprint` rend l'upsert idempotent : une même annonce vue sur plusieurs
sources ne crée pas de doublon. C'est ce qui garantit un compte de « projets actifs » crédible.

**4) Écriture via `service_role`.** L'ingestion écrit `market_projects` **uniquement** avec
la clé `service_role` (côté serveur). Le client n'a **aucun** droit d'écriture : la migration
fait `revoke insert, update, delete on public.market_projects from anon, authenticated`.

### Maîtrise du risque légal (correctif de l'audit)

L'audit a noté un **risque juridique sur le scraping**. Politique appliquée :

1. **Sources officielles d'abord** : APIs et flux standardisés (Data360, OCDS, avis MDB)
   sont privilégiés ; ce sont des données publiques destinées à la rediffusion.
2. **`robots.txt` & CGU respectés** : pour les portails HTML, on respecte `robots.txt`, on
   limite la fréquence (cron quotidien, pas de martèlement), on plafonne
   (`max_items_per_source`, `crawl_pages`) et on s'identifie par un User-Agent honnête.
3. **Métadonnées, pas recopie** : on stocke titre/montant/phase/contact public + **lien vers
   la source** (`source`), pas une copie intégrale du contenu protégé.
4. **Préférence partenariats/API** : là où un portail propose une API ou un export (TED,
   OCDS), on l'utilise plutôt que de scraper le HTML.
5. **Désactivation par source** : chaque source a un flag `enabled` ; une source au statut
   juridique douteux se coupe sans redéploiement.

> ⚠️ **MVP vs roadmap.** Le MVP s'appuie **exclusivement sur les sources officielles**
> (API/flux : Data360, OCDS, avis MDB). Les portails HTML nationaux et les annonces
> d'occasion (Mascus/leboncoin) ne passent en production **qu'après revue CGU au cas par cas**.

---

## 4. Accès payant — la veille comme driver d'abonnement

**Principe.** `market_projects` est un **produit Pro/Enterprise**, pas une donnée ouverte.

**Garde n°1 — RLS base (migration `0003`).** La policy `market_projects_select_paid`
n'autorise le `SELECT` que si l'utilisateur a un abonnement actif dans `pro_clients` :

```sql
create policy market_projects_select_paid on public.market_projects
  for select to authenticated using (
    exists (select 1 from public.pro_clients pc
            where pc.user_id = auth.uid() and pc.subscription_status = 'active')
  );
```

Pas de policy pour `anon` → **deny par défaut**. Aucun accès gratuit (finding audit corrigé).

**Garde n°2 — API monitor.** Côté FastAPI, la dépendance `require_paid_user_or_admin`
(`app/auth.py`) valide le JWT Supabase **puis** vérifie l'abonnement actif via `pro_clients`
(statuts `active`/`trialing`/`paid`, types `pro`/`premium`/`enterprise`), avec cache mémoire
60 s. Échec → `403 Abonnement payant requis`.

> Note dette : la route lecture seule actuelle `/projects` (`app/routes/projects.py`) utilise
> `require_user_or_admin` (tout utilisateur connecté). **Action MVP** : basculer les endpoints
> de veille NextGen sur `require_paid_user_or_admin` pour aligner l'API sur la RLS. La donnée
> reste protégée par la RLS quoi qu'il arrive ; cet alignement supprime juste une asymétrie.

**Positionnement commercial.** La veille est un argument d'abonnement à elle seule : un loueur
qui décroche **un seul** chantier grâce à une alerte a rentabilisé son année d'abonnement.
C'est le crochet d'acquisition Pro/Enterprise.

---

## 5. Alertes (matching projet ↔ requête → notification)

**But.** Transformer le flux de projets en **signal personnalisé** : « un projet `mining`
au Sénégal, budget > 10 M$, vient d'entrer en phase `tender` ».

**Matching (logique réelle existante).** `app/alerts/evaluator.py` évalue une requête contre
un projet en **ET logique**, conditions vides ignorées :

- `country` ∈ liste · `type/sector` ∈ liste · `phase` ∈ liste
- `budget_min` / `budget_max` (bornes sur le budget)
- `keywords` (présence dans le titre, insensible à la casse)

La `query` jsonb de `market_alerts` (`{country, sector, equipment_types, min_budget}`) se mappe
directement sur cet évaluateur. `equipment_types` croise les besoins en engins déduits par le
moteur de règles (§3) — base du scoring d'opportunité (roadmap §9).

**Canaux.** `channel` ∈ `email` / `whatsapp` / `in_app` :

- **email** (MVP) — canal fiable, via la fonction d'envoi existante.
- **in_app** (MVP) — badge/notification dans le dashboard.
- **whatsapp** (roadmap) — **canal n°1 en Afrique**. Le marché informel des engins se traite
  déjà sur WhatsApp ; un bouton « Recevoir mes alertes sur WhatsApp » est l'option la plus forte
  pour l'engagement. Implémentation via API WhatsApp Business (templates pré-approuvés) — voir
  roadmap.

**Anti-spam.** Une alerte ne notifie un projet **qu'une fois** (clé `(alert_id, project fingerprint)`),
fréquence groupée (digest), respect du `active=false`.

---

## 6. APIs / Edge Functions

Frontière nette : **le client lit/soumet ; le serveur ingère/évalue/écrit.**

| Fonction | Acteur | Auth | Rôle |
|---|---|---|---|
| `list-projects` | client abonné | JWT + abonnement actif | liste/filtre/pagine `market_projects` (pays, secteur, budget, phase, recherche) |
| `get-project` | client abonné | idem | fiche projet détaillée (+ besoins engins) |
| `create-alert` | client | JWT (propriétaire) | crée/modifie/désactive une `market_alert` (RLS `market_alerts_own`) |
| `list-alerts` | client | JWT (propriétaire) | gère ses alertes |
| `ingest-projects` | **serveur/cron** | `service_role` | lance les connecteurs → normalise → dédup → upsert `market_projects` |
| `evaluate-alerts` | **serveur/cron** | `service_role` | matche nouveaux projets ↔ alertes actives → envoie notifications |

- **Lecture abonnés** : relai Edge Function → API monitor (`require_paid_user_or_admin`), ou
  lecture directe `market_projects` sous RLS. La RLS reste le dernier rempart.
- **Écriture** : `ingest-projects` et `evaluate-alerts` tournent en **cron** (déclenché), pas
  exposés au client. Aujourd'hui l'ordonnancement est APScheduler in-process (`app/scheduler.py`) ;
  **dette identifiée à l'audit** → migrer vers workers + cron déclenché + healthcheck profond
  (cf. `NEXTGEN_TRANSFORMATION.md` §7).

---

## 7. UI — Dashboard de veille (Pro/Enterprise)

Écran réservé aux abonnés (gating au niveau route + données).

1. **Carte (Leaflet)** : projets géolocalisés (`lat`/`lng`), pins colorés par `sector`, clusters.
   Survol = mini-fiche (titre, budget, phase).
2. **Filtres** : `pays`, `secteur` (mining/btp/energy/infrastructure), `budget` (min/max),
   `phase` (study→operation). Filtrés en SQL via les index.
3. **Liste + fiche projet** : titre, pays, secteur, budget, phase, démarrage, **source (lien)**,
   contacts (maître d'ouvrage), **besoins en engins estimés**, et CTA « Trouver ces engins »
   (croisement catalogue — roadmap) / « Créer une alerte sur ce profil ».
4. **Gestion d'alertes** : créer/éditer une requête (pays + secteur + budget + types d'engins),
   choisir le canal (email/in-app, puis **bouton WhatsApp**), activer/désactiver, historique des
   matchs.
5. **Mur d'abonnement** : pour un non-abonné, aperçu flouté + CTA « Passer Pro » (la veille est
   un argument de conversion direct).

> Anti-façade : tant que `evaluate-alerts` n'est pas branché en prod, l'UI alertes affiche
> « bientôt disponible » pour le canal concerné — **pas** de fausse confirmation d'envoi.

---

## 8. KPIs

| KPI | Définition | Cible pilote |
|---|---|---|
| **Projets actifs** | `market_projects` distincts (post-dédup) en phase ≤ `construction` | croissance hebdo > 0 |
| **Couverture pays** | nb pays avec ≥ 1 source officielle ingérée | ≥ 8 (Afrique de l'Ouest cible) |
| **Fraîcheur des données** | délai médian publication source → présence en base | < 48 h |
| **Taux de dédup** | doublons fusionnés / brut ingéré | mesuré (preuve de qualité) |
| **Alertes actives / abonné** | moyenne d'alertes `active=true` | ≥ 1,5 |
| **Taux d'ouverture alertes** | ouvertures email / WhatsApp lus | email > 30 % ; WhatsApp > 60 % (attendu) |
| **Conversion veille → abonnement** | visiteurs mur de veille → abonnés Pro | suivi entonnoir |
| **Conversion veille → lead** | alerte → recherche d'engins → demande de devis / inspection | KPI nord (lie la veille au cœur business) |

`platform_events` (append-only, migration `0003`) journalise `alert_opened`,
`project_viewed`, `equipment_search_from_project` → mesure réelle de l'entonnoir.

---

## 9. MVP vs roadmap

**MVP (livrable, sans façade) :**

- ✅ Schéma `market_projects` / `market_alerts` + RLS abonnés (**fait**, migration `0003`).
- ✅ Moteur d'ingestion + dédup `fingerprint` + évaluateur d'alertes (**code réel existant**).
- 🔜 Ingestion **sources officielles uniquement** (Data360 API, OCDS, avis MDB WB/AfDB/IsDB).
- 🔜 Projection normalisée + géocodée vers `market_projects` (Edge `ingest-projects` en cron).
- 🔜 Dashboard veille : carte + filtres + fiche projet (lecture abonnés).
- 🔜 **Alertes email + in-app** (`evaluate-alerts` en cron).
- 🔜 Alignement API : endpoints veille sous `require_paid_user_or_admin`.

**Roadmap (explicitement non livré) :**

- 📐 **Canal WhatsApp** (API WhatsApp Business, templates) — priorité produit n°1 post-MVP.
- 📐 **Portails HTML nationaux** activés au cas par cas après revue CGU/robots.txt.
- 📐 **Scoring d'opportunité** : pondérer un projet par adéquation aux engins du Pro
   (budget × secteur × phase × proximité × types d'engins).
- 📐 **Croisement catalogue** : « ce projet a besoin de N pelles » → annonces MineGrid +
   vendeurs vérifiés correspondants (lie veille → Trust Layer → vente).
- 📐 Enrichissement IA des AO (extraction besoins depuis documents) — déjà amorcé côté monitor
   (`app/llm/enrichment.py`), à industrialiser sous budget IA maîtrisé.

---

## 10. Moat & lecture investisseur

**Pourquoi c'est défendable.** Le moat n'est pas « avoir une liste de projets » (copiable),
c'est la **combinaison** :

1. **Fraîcheur** — pipeline d'ingestion multi-sources outillé et dédupliqué, qui tourne seul.
2. **Ciblage** — matching projet ↔ profil d'engins du Pro, sur des données structurées
   (secteur/phase/budget/besoins), pas un simple flux RSS.
3. **Intégration verticale veille → achat** — la veille n'est pas une fin : elle alimente le
   cœur transactionnel (recherche d'engins → vendeur vérifié → inspection → escrow → logistique).
   *Aucun agrégateur d'AO ne possède cette aval.*
4. **Intelligence marché propriétaire** — chaque projet ingéré, chaque alerte ouverte, chaque
   recherche d'engins déclenchée nourrit `platform_events` et, à terme, le scoring d'opportunité.
   La donnée s'auto-renforce (effet de données décrit dans `NEXTGEN_TRANSFORMATION.md` §3).

**Le récit investisseur.** MineGrid Intelligence transforme une dépense (« je cherche du
matériel ») en **anticipation** (« je sais où sera la demande »). C'est un produit
d'abonnement à forte valeur perçue (un chantier décroché >> prix de l'abonnement), un canal
d'acquisition Pro/Enterprise, et la **source amont de leads** pour toute la stack
transactionnelle. Ce n'est pas un listing de plus : c'est de l'**intelligence marché
propriétaire** branchée sur une infrastructure de confiance.

---

### Références code (existant, vérifié)

- `sql/nextgen/0003_logistics_intelligence_data.sql` — tables `market_projects`,
  `market_alerts` + RLS (`market_projects_select_paid`, `market_alerts_own`) + `revoke`.
- `services/monitor-service/app/ingestion/registry.py` + `sources.yaml` — connecteurs & sources.
- `services/monitor-service/app/ingestion/fingerprint.py` — déduplication `sha256`.
- `services/monitor-service/app/alerts/evaluator.py` — matching projet ↔ requête (ET logique).
- `services/monitor-service/app/auth.py` — `require_paid_user_or_admin` (garde abonnement).
- `services/monitor-service/app/routes/projects.py` — endpoints lecture projets (à durcir).
- `services/monitor-service/app/scheduler.py` — ordonnancement (dette → workers/cron).
