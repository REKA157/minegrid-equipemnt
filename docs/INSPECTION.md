# MineGrid Inspection — l'actif qui crée la confiance

> Statut : **pré-lancement**. Ce document décrit un module dont le **socle de données est réel**
> (migration `sql/nextgen/0001_trust_and_inspection.sql`, déployable, RLS stricte) mais dont les
> **Edge Functions, l'app inspecteur et l'UI publique restent à construire**. Chaque section
> distingue explicitement **MVP réel** (ce qui existe / est immédiatement réalisable sur les tables
> en place) de **roadmap** (ce qui est conçu mais non codé). Aucune façade : tout ce qui n'est pas
> branché est marqué comme tel.

---

## 1. Problème & thèse

Un acheteur ne vire pas 120 000 € sur une fiche web. En Afrique francophone, l'achat d'un engin
d'occasion (pelle, chargeuse, tombereau, niveleuse) à l'import implique une asymétrie d'information
massive : l'acheteur est à Abidjan, la machine à Casablanca ou en Europe, et la seule preuve d'état
est un jeu de photos fournies par… le vendeur. Résultat observé sur le marché : transactions qui
n'aboutissent jamais (l'acheteur ne se déplace pas, le vendeur ne baisse pas sa garde), ou pire,
litiges post-livraison sur des heures-machine trafiquées et des organes en fin de vie.

**Thèse.** La confiance ne se décrète pas, elle se **certifie**. Le produit qui débloque la
transaction n'est pas une meilleure fiche, c'est une **inspection physique, structurée et
certifiée par un tiers**, attachée à la machine et **opposable**. C'est la condition d'entrée de
l'escrow (un séquestre ne libère les fonds que contre un état connu) et du financement (un prêteur
ne finance que ce qu'il peut évaluer).

**Référence marché.** IronPlanet a bâti son enchère B2B sur **IronClad Assurance** : un rapport
d'inspection standardisé et garanti qui a permis de vendre des engins à plus de 500 000 $ **sans
que l'acheteur n'inspecte physiquement** (acquisition par Ritchie Bros. ~758 M$). Plus récemment,
Boom & Bucket facture l'inspection tierce à partir de **~199 $** et documente des prix de revente
**~40 % supérieurs** aux ventes aux enchères « as-is, where-is ». L'inspection n'est pas un coût :
c'est ce qui transforme un actif opaque en actif liquide.

Pour MineGrid, c'est **l'espace défendable** : pas le listing (réplicable en un week-end), mais la
**couche de confiance** — un réseau d'inspecteurs au sol + une donnée d'état machine propriétaire.

---

## 2. Modèle de données

Quatre tables réelles, déjà écrites dans `sql/nextgen/0001_trust_and_inspection.sql`. Principe
directeur (commentaire en tête de migration) : **les écritures sensibles — rédaction et
certification d'un rapport — sont réservées au `service_role`**. Le client ne peut que **lire** et
**soumettre une demande** (`status='requested'`).

### 2.1 `inspectors` — annuaire des inspecteurs

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | identifiant inspecteur |
| `user_id` | uuid → `auth.users` (`on delete set null`) | compte lié (optionnel) |
| `full_name` | text NOT NULL | nom affiché publiquement |
| `zone` | text | aire d'intervention : `Dakar`, `Abidjan`, `Casablanca`, … |
| `certifications` | jsonb `[]` | qualifications (ex. `["CES Caterpillar","contrôle hydraulique"]`) |
| `active` | boolean `true` | disponible pour affectation |

**RLS** : `inspectors_select_public` → lecture `anon`+`authenticated` (annuaire public). Aucune
policy d'écriture ⇒ **insertion/MAJ réservées au `service_role`**. `INSERT/UPDATE/DELETE` révoqués
pour `anon, authenticated`.

### 2.2 `inspection_requests` — demande d'inspection

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `machine_id` | uuid NOT NULL | machine concernée |
| `requester_id` | uuid → `auth.users` (`on delete cascade`) | demandeur |
| `inspector_id` | uuid → `inspectors` (`on delete set null`) | inspecteur affecté (serveur) |
| `status` | text | `requested` → `assigned` → `in_progress` → `completed` / `cancelled` |
| `location` | text | lieu de l'inspection terrain |
| `scheduled_at` | timestamptz | créneau planifié |
| `price_amount` / `price_currency` | numeric(12,2) / text=`EUR` | prix de la prestation |

**RLS** : le demandeur voit (`inspection_requests_select_own`, `requester_id = auth.uid()`) et crée
(`inspection_requests_insert_own`, `with check (requester_id = auth.uid() AND status='requested')`)
**ses** demandes. La transition de statut et l'affectation passent par le serveur (`UPDATE/DELETE`
révoqués).

### 2.3 `inspection_reports` — le rapport (cœur de la confiance)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid **unique** → `inspection_requests` | 1 rapport / 1 demande |
| `inspector_id` | uuid → `inspectors` | auteur |
| `overall_grade` | text ∈ `A/B/C/D/F` | note d'état globale |
| `hours_meter` | int | relevé du compteur horaire |
| `findings` | jsonb `{}` | constats structurés : moteur, hydraulique, train, … |
| `pdf_url` | text | rapport PDF généré côté serveur |
| `certified` | boolean `false` | **passe à `true` uniquement via `service_role`** |
| `certified_at` | timestamptz | horodatage de certification |

**RLS** : `inspection_reports_select` → lecture si `certified = true` (**public**, c'est le rapport
opposable) **OU** si l'appelant est le demandeur de la requête liée (rapport en cours, privé).
Rédaction + bascule `certified` = `service_role`. C'est la règle (2) du projet : **l'écriture de
certification est serveur uniquement**, jamais exposée au client.

### 2.4 `inspection_media` — preuves visuelles avec empreinte

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `report_id` | uuid → `inspection_reports` (`on delete cascade`) | rapport parent |
| `url` | text NOT NULL | objet Storage (photo/vidéo/doc) |
| `kind` | text ∈ `photo/video/oil_analysis/document` | nature du média |
| `sha256` | text | **empreinte d'intégrité** |

**RLS** : `inspection_media_select` → visible si le rapport parent est visible (certifié ou
demandeur). Écritures révoquées au client.

### 2.5 Rôle du `sha256` (à expliciter, car c'est le mécanisme de confiance)

Le `sha256` est l'**empreinte cryptographique** du fichier média (photo, analyse d'huile, document).
Calculé au moment de l'upload et **stocké à côté de l'URL**, il rend le média **infalsifiable a
posteriori** : recalculer le hash du fichier servi et le comparer à la valeur en base prouve qu'une
photo certifiée n'a **pas** été remplacée ou retouchée après certification. Combiné à `certified_at`,
on obtient une **preuve horodatée** : « cette photo, ce hash, à cette date ». C'est ce qui transforme
une galerie en **pièce opposable** dans un litige ou face à un prêteur. (Mécanisme conçu ; le calcul
de hash est à implémenter côté upload — voir §4.)

> **Note de liaison.** La même migration crée `machine_history(event_type ∈ … 'inspected' …)`. Une
> certification doit, côté serveur, **journaliser un événement `inspected`** sur la machine — la
> traçabilité d'état devient ainsi cumulative et publique (`machine_history_select_public`).

---

## 3. Workflow complet

```
[Acheteur/Vendeur]                [Serveur / service_role]              [Inspecteur terrain]
       |                                   |                                    |
 (1) Demande d'inspection                  |                                    |
   INSERT inspection_requests              |                                    |
   status='requested' (RLS client) ------> |                                    |
       |                          (2) Affectation par zone                      |
       |                            UPDATE inspector_id,                        |
       |                            status='assigned' ---------------------->   |
       |                                   |                          (3) Inspection terrain
       |                                   |                            (app mobile / web)
       |                                   | <----- (4) submit-report ----------|
       |                          INSERT inspection_reports                     |
       |                          findings{moteur,hydraulique,                  |
       |                            train,heures}, grade, hours_meter           |
       |                          + INSERT inspection_media (url+sha256)        |
       |                          status='in_progress'->'completed'             |
       |                          (5) generate-inspection-pdf -> pdf_url        |
       |                          (6) certify-report:                           |
       |                            certified=true, certified_at=now()          |
       |                            + machine_history 'inspected'               |
       | <--- (7) Badge « Inspecté MineGrid » sur la fiche (rapport public) --- |
```

1. **Demande** — l'acheteur (ou le vendeur qui veut rassurer) crée une `inspection_request` sur une
   machine. Seul champ de statut autorisé côté client : `requested` (forcé par la policy).
2. **Affectation par zone** — le serveur sélectionne un inspecteur `active=true` dont la `zone`
   couvre la `location`, renseigne `inspector_id`, passe à `assigned`, planifie `scheduled_at`.
3. **Inspection terrain** — l'inspecteur se rend sur place. Saisie via app (MVP : **formulaire web
   responsive** ; roadmap : app mobile dédiée hors-ligne).
4. **Rapport structuré** — `findings` en JSON par organe :
   ```json
   {
     "moteur":      { "etat": "B", "fuites": false, "demarrage": "ok", "fumee": "legere" },
     "hydraulique": { "etat": "A", "fuites": false, "verins": "ok" },
     "train":       { "etat": "C", "usure_chaines_pct": 55, "galets": "a_surveiller" },
     "heures":      { "compteur": 8420, "coherent_avec_usure": true }
   }
   ```
   `overall_grade` (A→F) synthétise ; `hours_meter` relève le compteur.
5. **Médias certifiés** — upload des photos/vidéos/analyse d'huile dans Storage ; pour chaque
   fichier, **calcul du `sha256`** et insertion dans `inspection_media`.
6. **PDF** — génération serveur du rapport (`pdf_url`), incluant grade, constats, photos clés,
   empreintes.
7. **Certification serveur** — `certify-report` (service_role) bascule `certified=true`,
   `certified_at=now()`, journalise `machine_history` `inspected`. **À cet instant**, le rapport et
   ses médias deviennent **publics** (RLS) et le **badge « Inspecté MineGrid »** s'affiche sur la
   fiche.

---

## 4. APIs / Edge Functions

> **État réel.** Aucune Edge Function d'inspection n'existe encore (`supabase/functions/` ne contient
> que `create-payment`, `stripe-webhook`, `send-contact-email`, `exchange-rates`). Les fonctions
> ci-dessous sont **à créer**, en réutilisant le patron **déjà éprouvé** de `create-payment`
> (allow-list CORS via `ALLOWED_ORIGINS`, vérification JWT par `supabase.auth.getUser(jwt)`,
> rate-limiting par IP, **montant calculé côté serveur jamais reçu du client**, clé d'idempotence).

Séparation stricte **client vs serveur** (règle 2) :

| Fonction | Rôle d'exécution | Entrée | Effet | Statut |
|---|---|---|---|---|
| `create-inspection-request` | **client** (JWT acheteur) | `machine_id`, `location`, créneau souhaité | INSERT `inspection_requests` (`status='requested'`, `requester_id=auth.uid()`), **prix calculé serveur** | à créer |
| `assign-inspector` | **serveur** (`service_role`) | `request_id` | choisit inspecteur par `zone`, set `inspector_id`+`scheduled_at`, `status='assigned'` | à créer |
| `submit-report` | **serveur** (app inspecteur authentifiée serveur) | `request_id`, `findings`, `grade`, `hours_meter`, médias[] | INSERT `inspection_reports` + `inspection_media` (avec `sha256`), `status` `in_progress`→`completed` | à créer |
| `certify-report` | **serveur** (`service_role`) | `report_id` | validation QA, `certified=true`, `certified_at`, log `machine_history` `inspected` | à créer |
| `generate-inspection-pdf` | **serveur** | `report_id` | rend le PDF, écrit `pdf_url` | à créer |

Garde-fous obligatoires (repris de `create-payment`) :

- **CORS allow-list** : refus des origines hors `ALLOWED_ORIGINS`.
- **Auth** : `Authorization: Bearer <jwt>` → `supabase.auth.getUser` ; 401 sinon. Pour les fonctions
  serveur, contrôle d'appartenance au rôle inspecteur/admin **avant** toute écriture.
- **Le prix d'inspection est une grille canonique côté serveur** (comme `PLAN_PRICES_EUR_CENTS`),
  jamais transmis par le client — un client ne fixe pas le prix de sa propre inspection.
- **Idempotence** sur `certify-report` et `generate-inspection-pdf` (re-certifier ne doit pas
  dupliquer un événement `machine_history`).

> **Pourquoi `submit`/`certify` ne sont pas des INSERT clients.** Les policies n'autorisent **aucune**
> écriture cliente sur `inspection_reports`/`inspection_media` (grants révoqués). C'est volontaire :
> un rapport certifié engage la plateforme. La seule voie d'écriture est le serveur — conformité
> directe à la règle (2) « écritures sensibles = serveur uniquement ».

---

## 5. UI

> **État réel.** `src/nextgen/inspection/` est **vide**. À titre de comparaison, le module sœur
> `src/nextgen/trust/` est, lui, **codé** (`TrustBadge.tsx`, `computeTrustScore.ts`, `trustService.ts`
> avec tests) — il fournit le **patron de référence** (service + composant + tests) à répliquer ici.

Écrans à construire (MVP en gras) :

- **Formulaire de demande** *(MVP)* — sur `MachineDetail`, bouton « Demander une inspection
  MineGrid » → formulaire (lieu, créneau, qui paie). Affiche le **prix renvoyé par le serveur**.
  Crée une `inspection_request`.
- **Espace inspecteur** *(MVP léger)* — liste des demandes `assigned`/`in_progress` de l'inspecteur,
  saisie du rapport structuré (sections moteur/hydraulique/train/heures), upload photos. En MVP, un
  **formulaire web responsive** suffit ; l'app mobile dédiée est en roadmap.
- **Rapport public certifié** *(MVP)* — page lisible sans compte (RLS publique si `certified`) :
  **grade** A→F mis en avant, constats par organe, **galerie** des médias, `hours_meter`, bouton
  « Télécharger le PDF », mention « Certifié le … ». Vérification d'empreinte possible (hash affiché).
- **Badge « Inspecté MineGrid »** *(MVP)* — composant `InspectionBadge` (calque sur `TrustBadge`)
  affiché sur `MachineDetail` et sur les cartes de résultats dès qu'un rapport certifié existe ;
  cliquable vers le rapport public.
- **Annuaire inspecteurs** *(roadmap)* — page publique listant `inspectors` par zone (la table est
  déjà en lecture publique).

---

## 6. Modèle économique

L'inspection est une **prestation payante**, facturée **150–300 €** selon le type d'engin et la
distance (benchmark Boom & Bucket ~199 $ ; positionnement premium justifié par la certification +
PDF opposable + intégration escrow). Le montant est stocké dans `inspection_requests.price_amount`
(`EUR`).

**Qui paie ?** Deux schémas, tous deux supportés par la même table :

- **Acheteur payeur** (par défaut) — il paie pour sécuriser un achat à distance ; coût marginal face
  à un engin à 6 chiffres. L'inspection devient sa **due diligence**.
- **Vendeur payeur** — un vendeur qui veut **se démarquer** finance l'inspection en amont (« machine
  pré-inspectée »), ce qui élargit son audience et soutient un **prix de vente supérieur** (effet
  +40 % documenté côté Boom & Bucket).

**Répartition de la valeur** (paramétrable) :

- **Marge inspecteur** : ~50–60 % du prix reversé à l'inspecteur freelance (sa rémunération terrain).
- **Marge MineGrid** : ~40–50 %, couvrant QA/certification, génération PDF, hébergement des preuves,
  et la **garantie** attachée au badge.
- **Effet de levier** : l'inspection est le **point d'entrée payant** vers l'escrow et le financement
  (modules `0002_escrow_and_finance`), où se trouvent les revenus récurrents. L'inspection peut être
  vendue à faible marge — elle **qualifie** la transaction.

---

## 7. KPIs

| KPI | Définition | Cible initiale |
|---|---|---|
| **Délai moyen demande → certification** | `certified_at` − `inspection_requests.created_at` | < 5 jours ouvrés |
| **Taux machines grade A/B** | part des `inspection_reports` certifiés avec `overall_grade ∈ {A,B}` | suivi (santé du parc) |
| **% transactions avec inspection** | transactions abouties précédées d'un rapport certifié | > 30 % à 6 mois |
| **Taux de conversion demande → rapport certifié** | `completed`+`certified` / `requested` | > 80 % |
| **Couverture par zone** | nb d'inspecteurs `active` par `zone` vs demande | ≥ 2 / zone clé |
| **NPS inspection** | satisfaction acheteur/vendeur post-rapport | > 50 |
| **Litiges post-inspection** | litiges sur machines certifiées / total certifiées | < 2 % |

> Tous ces KPIs sont calculables **directement sur les tables réelles** (`inspection_requests`,
> `inspection_reports`, `machine_history`) une fois les Edge Functions branchées — pas de
> télémétrie tierce requise pour le MVP.

---

## 8. MVP vs roadmap

### MVP (réalisable sur l'existant)

- **Tables + RLS** : **fait** (`0001_trust_and_inspection.sql`, déployable). C'est le socle réel.
- **Inspecteurs freelance** enregistrés en base (`inspectors`), affectés manuellement/semi-auto par
  zone.
- **Checklist standard** : `findings` JSON moteur / hydraulique / train / heures + grade A→F.
- **Upload photos + `sha256`** dans Storage et `inspection_media`.
- **Génération PDF** serveur + bascule `certified` (service_role).
- **Rapport public + badge** sur `MachineDetail` (à coder, patron = module `trust`).
- **Edge Functions** `create-inspection-request` / `assign-inspector` / `submit-report` /
  `certify-report` / `generate-inspection-pdf` (à coder, patron = `create-payment`).

### Roadmap (conçu, non codé)

- **App mobile inspecteur dédiée** (saisie hors-ligne terrain, capture photo native + hash on-device,
  synchro différée).
- **Analyse d'huile** (`kind='oil_analysis'`) intégrée au grade — partenariat labo.
- **Télématique** : ingestion de données moteur/heures via API constructeur pour **recouper** le
  `hours_meter` déclaré (anti-fraude compteur).
- **Certification tierce** (organisme indépendant) pour les transactions à fort montant.
- **Affectation automatique optimisée** (distance, charge, spécialité dans `certifications`).
- **Annuaire inspecteurs public** + notation des inspecteurs.

---

## 9. Moat & lecture investisseur

**Pourquoi c'est défendable :**

1. **Réseau d'inspecteurs au sol = barrière opérationnelle.** Recruter, former et fiabiliser des
   inspecteurs zone par zone (Dakar, Abidjan, Casablanca…) prend des trimestres et se construit dans
   le réel — un concurrent purement logiciel ne peut pas le copier. La table `inspectors`
   (zone + certifications) est le registre de cet actif physique.
2. **Donnée d'état machine propriétaire.** Chaque inspection certifiée enrichit un corpus
   **unique** : grades, constats par organe, heures recoupées, photos hashées. Ce corpus
   (`inspection_reports` + `machine_history` `inspected`) alimente à terme un **scoring d'état** et
   une **valorisation** que personne d'autre ne possède. C'est de la donnée qui **s'accumule** et se
   défend.
3. **Effet de système.** L'inspection certifiée est la **clé** qui ouvre l'escrow et le financement
   (`0002_escrow_and_finance`). Elle n'est pas un produit isolé : elle **conditionne** le reste de la
   pile de confiance. Qui contrôle l'inspection contrôle le point d'entrée de la transaction.
4. **Précédent de sortie.** IronClad → IronPlanet → Ritchie Bros. (~758 M$) prouve que la confiance
   certifiée, et non le listing, est ce que le marché paie. MineGrid applique ce modèle à un marché
   (Afrique francophone, engins lourds) où l'asymétrie est **plus forte** et la couverture
   d'inspection **inexistante**.

**Honnêteté pré-lancement (règle 1).** Aujourd'hui, l'actif réel est la **migration SQL avec RLS
stricte** : le contrat de confiance (qui peut écrire quoi) est posé et correct. Le reste — Edge
Functions, app inspecteur, UI, et surtout le **réseau humain d'inspecteurs** — est à exécuter. La
valeur n'est pas dans le code déjà écrit ; elle est dans la **séquence** : socle de données sûr →
réseau terrain → données propriétaires → escrow/financement. C'est cette séquence, pas une démo, qui
constitue le moat.
