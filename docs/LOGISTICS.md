# MineGrid Logistics — devis transport, suivi & dédouanement

> Module d'orchestration logistique pour engins lourds, Afrique francophone.
> **Statut : pré-lancement.** Ce document distingue explicitement le **MVP** (ce
> qui existe / ce qui est livrable au lancement) de la **roadmap** (ce qui est
> visé, non construit). Aucune capacité décrite ici n'est présentée comme
> acquise si elle ne l'est pas.

**Positionnement non négociable.** MineGrid **n'est pas un transporteur**. Pas de
camions, pas de navires, pas de float de fret, pas d'actifs lourds au bilan.
MineGrid est **apporteur d'affaires et orchestrateur** : nous mettons en relation
le demandeur (acheteur d'un engin sur la plateforme) avec un réseau de
**transporteurs et transitaires partenaires**, nous structurons le devis, nous
suivons l'expédition et le dédouanement, et nous **rattachons le tout à la
transaction sécurisée (escrow)**. La marge est une **marge d'apport** (commission
sur le devis partenaire), pas une marge de transport opérée en propre.

---

## 1) Problème & thèse

### 1.1 La logistique d'engins lourds est un point de rupture, pas un détail

Acheter une pelle hydraulique de 25 t à Anvers et la faire rouler sur un chantier
à Abidjan, ce n'est pas « ajouter les frais de port ». C'est :

- **Du hors-gabarit** : poids (15–50 t), dimensions, parfois colis non
  conteneurisable (RoRo, flat-rack, conventionnel). Le mode et le matériel de
  transport dépendent de la machine, pas d'une grille générique.
- **Un dédouanement opaque** : classification tarifaire (HS code), droits et
  taxes variables, documents (facture, packing list, certificat d'origine,
  connaissement). Une erreur de code ou un document manquant = marchandise
  **bloquée au port**, frais de surestaries qui courent.
- **Une fiscalité d'importation réelle** : en zone CEDEAO/UEMOA, le **Tarif
  Extérieur Commun (TEC)** s'échelonne de **0 % à 35 %** selon la catégorie, plus
  TVA, prélèvements communautaires et redevances locales. Le coût « rendu
  chantier » (DDP) peut être très supérieur au prix d'achat de la machine.
- **Un risque de confiance** : tant que l'engin n'est pas livré et dédouané,
  l'acheteur ne veut pas libérer les fonds, et le vendeur ne veut pas expédier
  sans garantie. C'est exactement le rôle de l'escrow — la logistique en est le
  **déclencheur de dénouement**.

### 1.2 La thèse : une fiche sans livraison ne conclut rien

Un site d'annonces s'arrête au « match » (l'acheteur trouve la machine). Le match
ne paie pas. Ce qui paie, c'est le **post-match** : sécuriser le paiement,
transporter, dédouaner, livrer. **MineGrid Logistics capture le post-match.** En
rendant la livraison porte-à-porte (et son dédouanement) opérable depuis la fiche
machine et adossée à l'escrow, la plateforme devient **indispensable à la
transaction**, pas optionnelle. Une annonce se compare sur le prix ; une
transaction sécurisée + livrée ne se compare pas — elle se refait, ou pas.

### 1.3 L'atout structurel : le hub marocain et les corridors

Le Maroc est le **pivot logistique** vers l'Afrique de l'Ouest francophone :

- **Tanger Med** : ~**10,2 M EVP (TEU) en 2024**, premier port à conteneurs de
  Méditerranée et d'Afrique, connecté à >180 ports. Un point de transbordement
  naturel entre l'approvisionnement européen (Anvers, Rotterdam, Marseille) et la
  desserte ouest-africaine.
- **Corridors maîtrisés** : axe **Dakar** (et le futur port de **Ndayane**),
  axe **Abidjan** (porte d'entrée de l'hinterland sahélien — Mali, Burkina).
- Conséquence : MineGrid peut **standardiser quelques corridors** (Anvers/Tanger
  Med → Abidjan/Dakar) plutôt que de prétendre couvrir le monde, et y négocier
  des grilles partenaires compétitives. Le corridor maîtrisé est un actif.

---

## 2) Modèle de données

Source de vérité : `sql/nextgen/0003_logistics_intelligence_data.sql`. Deux tables,
toutes deux reliées à la transaction sécurisée via `escrow_id`.

### 2.1 `logistics_quotes` — le devis / l'expédition

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | Identifiant du devis/expédition |
| `requester_id` | uuid → `auth.users` | Demandeur (acheteur). Cascade. |
| `machine_id` | uuid | Machine concernée (lien fiche) |
| `escrow_id` | uuid | **Lie le transport à la transaction sécurisée** |
| `origin` | text | Ex. `'Anvers, BE'`, `'Tanger Med, MA'` |
| `destination` | text | Ex. `'Abidjan, CI'` |
| `incoterm` | text | `EXW`/`FOB`/`CFR`/`CIF`(défaut)/`DAP`/`DDP` |
| `mode` | text | `road`/`sea`(défaut)/`rail`/`multimodal` |
| `weight_kg` | int | Poids de l'engin |
| `price_amount` / `price_currency` | numeric / text | Prix coté (défaut `EUR`) |
| `eta_days` | int | Délai estimé porte-à-porte |
| `carrier` | text | Transporteur/transitaire partenaire retenu |
| `status` | text | `requested`→`quoted`→`booked`→`in_transit`→`customs`→`delivered` (ou `cancelled`) |
| `created_at` / `updated_at` | timestamptz | Horodatage |

**RLS (réel)** :
- `logistics_select_own` : le demandeur lit **ses** devis (`requester_id = auth.uid()`).
- `logistics_insert_own` : le demandeur crée un devis **uniquement** au statut
  `requested` (`with check (... and status = 'requested')`). Il **ne peut pas**
  s'auto-coter.
- `update`/`delete` **révoqués** pour `anon` et `authenticated` : toute évolution
  de statut/prix passe par le **service_role** (Edge Function partenaire). Le
  client ne peut jamais réécrire un prix ou se déclarer « livré ».

### 2.2 `customs_cases` — le dossier de dédouanement

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | Identifiant du dossier douane |
| `logistics_quote_id` | uuid → `logistics_quotes` | Devis parent. Cascade. |
| `country` | text | Pays de dédouanement (ex. `CI`) |
| `hs_code` | text | Ex. `8429` (engins de terrassement) |
| `duties_amount` | numeric | Droits & taxes estimés |
| `status` | text | `pending`/`submitted`/`cleared`/`held` |
| `documents` | jsonb | Liste de pièces (défaut `[]`) |
| `created_at` | timestamptz | Horodatage |

**RLS (réel)** :
- `customs_select` : visible **uniquement** si le devis parent appartient au
  demandeur (jointure `logistics_quotes.requester_id = auth.uid()`).
- `insert`/`update`/`delete` **révoqués** côté client : seul le service_role
  (Edge Function douane) écrit le HS code, les droits et le statut. Le dossier
  douane est **administré**, jamais auto-déclaré.

### 2.3 Lien avec l'escrow

`escrow_id` n'est pas décoratif : il fait de la livraison **l'événement qui
autorise la libération des fonds**. Le cycle de vie logistique
(`delivered` + douane `cleared`) est le signal métier qui permet à l'escrow de
passer au dénouement. Logistique et finance sont **couplées par conception**.

---

## 3) Workflow

```
Fiche machine / Transaction (escrow)
        │
        ▼
[1] Demande de devis ........ logistics_quotes.status = requested   (client, RLS INSERT)
        │
        ▼
[2] Cotation partenaires .... status = quoted   (service_role : prix, carrier, eta, marge d'apport)
        │
        ▼
[3] Réservation ............. status = booked    (client accepte → service_role book partenaire)
        │
        ▼
[4] Suivi transport ......... status = in_transit (jalons : départ, transbordement Tanger Med, arrivée port)
        │
        ▼
[5] Dédouanement ............ status = customs   + customs_cases (HS 8429, droits estimés, documents)
        │                                          customs.status : pending→submitted→cleared
        ▼
[6] Livraison ............... status = delivered  (porte-à-porte confirmé)
        │
        ▼
[7] Confirme l'escrow ....... la livraison + douane cleared autorisent la libération des fonds
```

Points de contrôle :
- **Étape 1** : seule action côté client en écriture. Le reste est piloté
  serveur (RLS / révocations).
- **Étape 5** : un `customs.status = held` met l'expédition en alerte (blocage
  port) — déclenche une notification et une action transitaire.
- **Étape 7** : aucune libération de fonds n'est possible sans `delivered` +
  douane `cleared`. C'est le verrou anti-litige.

---

## 4) Calcul de devis

### 4.1 Paramètres d'entrée

- **Origine / destination** (corridor) — ex. `Anvers, BE` → `Abidjan, CI`.
- **Mode** — `sea` par défaut ; `road`/`rail`/`multimodal` selon corridor.
- **Caractéristiques de l'engin** — `weight_kg`, dimensions/volume (hors-gabarit,
  conteneurisable ou non : conteneur, flat-rack, RoRo, conventionnel).
- **Incoterm** — détermine **jusqu'où va la prestation** et qui porte le risque :
  - `EXW` (départ usine) → `FOB` (à bord) → `CFR`/`CIF` (port destination, fret/
    assurance inclus) → `DAP` (rendu, hors droits) → `DDP` (rendu **dédouané**,
    droits inclus). Plus on va vers `DDP`, plus MineGrid orchestre (et plus la
    `customs_cases` devient centrale).

### 4.2 MVP — grille tarifaire partenaires + marge d'apport

Au lancement, le devis est **assis sur une grille de tarifs négociés** auprès des
transitaires partenaires sur le(s) corridor(s) maîtrisé(s), ajustée au
poids/volume de l'engin, **plus une marge d'apport** (commission MineGrid).

- Brique existante réutilisée : le **simulateur d'estimation** côté front
  (`utils/transport`, `LogisticsSimulator.tsx`, `TransportCard.tsx`) fournit déjà
  une **fourchette indicative** (maritime + douane + terrestre) ports MA/EU →
  destinations africaines. **Important :** ce simulateur est une **estimation
  marketing**, pas un devis ferme. Le devis ferme = `logistics_quotes` coté par
  un partenaire via le workflow ci-dessus.
- Formule MVP (indicative) :
  `prix_client = tarif_partenaire(corridor, mode, poids/volume) + marge_apport`.
- Les **droits de douane** sont **estimés** (TEC CEDEAO/UEMOA selon HS code) et
  portés dans `customs_cases.duties_amount` — affichés comme estimation, confirmés
  par le transitaire.

### 4.3 Roadmap — automatisation

- **API transporteurs/transitaires** : cotation en temps réel (remplace la
  grille statique) ; comparaison multi-partenaires automatique.
- **Tracking GPS / EDI** : jalons d'expédition en temps réel (au-delà des statuts
  manuels).
- **Moteur de droits** : calcul automatisé des droits par HS code et pays
  (barème TEC + spécificités nationales), pré-rempli pour le transitaire.

---

## 5) APIs / Edge Functions

Séparation stricte **client (RLS, écriture minimale)** vs **serveur
(service_role, écriture autorisée)**.

| Fonction | Acteur | Rôle | Effet données |
|---|---|---|---|
| `request-logistics-quote` | **Client** | Crée la demande depuis une fiche/transaction | INSERT `logistics_quotes` (`status = requested`) |
| `quote-from-partners` | **Serveur** | Récupère/structure les cotations partenaires + marge | UPDATE → `status = quoted` (`price_amount`, `carrier`, `eta_days`) |
| `update-shipment-status` | **Serveur** | Fait avancer le cycle de vie (`booked`/`in_transit`/`delivered`) | UPDATE `status`, `updated_at` |
| `customs-update` | **Serveur** | Crée/maj le dossier douane (HS code, droits, docs, statut) | INSERT/UPDATE `customs_cases` |

Règles :
- `request-logistics-quote` est **la seule** fonction côté client en écriture ;
  elle respecte la policy `logistics_insert_own` (force `status = requested`).
- Toutes les fonctions serveur s'exécutent en **service_role** (les
  `update/delete` étant révoqués pour `authenticated`) — garantit qu'un prix, un
  statut de livraison ou un dédouanement **ne peut pas être falsifié côté client**.
- `update-shipment-status` à `delivered` (couplé à douane `cleared`) **émet le
  signal escrow** de dénouement.

---

## 6) UI

1. **Simulateur de transport (fiche machine)** — bloc « Estimer la livraison » :
   sélection corridor + incoterm + caractéristiques engin → fourchette de coût et
   délai (réutilise `LogisticsSimulator` / `TransportCard`). CTA « Demander un
   devis ferme » → `request-logistics-quote`. *Toujours étiqueté « estimation ».*

2. **Suivi d'expédition (étapes)** — timeline alignée sur `status` :
   `requested → quoted → booked → in_transit → customs → delivered`, avec le
   transbordement Tanger Med comme jalon visible sur les corridors EU→Afrique.
   État `cancelled` et alerte `customs.held` traités visuellement (blocage).

3. **Dossier douane** — vue dédiée par `customs_cases` : pays, **HS code**
   (ex. `8429`), **droits estimés**, **check-list documentaire** (`documents`
   jsonb : facture, packing list, certificat d'origine, connaissement),
   statut (`pending/submitted/cleared/held`). Lecture seule côté client.

4. **Rattachement transaction** — depuis la fiche transaction (escrow), accès
   direct au devis logistique lié (`escrow_id`) et à son dossier douane.

---

## 7) KPIs

| KPI | Définition | Pourquoi |
|---|---|---|
| **% transactions avec logistique** | transactions escrow ayant ≥1 `logistics_quotes` `booked+` / total transactions | Mesure la capture du post-match |
| **Marge d'apport moyenne** | moyenne (`price_amount` − coût partenaire) | Économie du modèle apporteur |
| **Délai porte-à-porte** | moyenne `eta_days` réalisé (`requested`→`delivered`) | Promesse opérationnelle |
| **Taux de dédouanement sans blocage** | `customs_cases` `cleared` sans passage `held` / total | Qualité du réseau transitaire |
| **Taux de conversion devis** | `booked` / `requested` | Compétitivité tarif + confiance |
| **Litiges logistiques** | transactions bloquées pour cause transport/douane | Risque escrow |

---

## 8) MVP vs roadmap

### MVP (lancement)
- **2 tables réelles** (`logistics_quotes`, `customs_cases`) + RLS + révocations
  d'écriture (déjà en base, migration `0003`).
- **Devis manuel** via transitaires partenaires sur **1 corridor** maîtrisé
  (cible : Anvers/Tanger Med → Abidjan **ou** Dakar).
- **Simulateur d'estimation** sur fiche machine (existant, étiqueté indicatif).
- **Suivi par statut** (jalons saisis par l'orchestrateur, pas GPS).
- **Dossier douane** avec HS code, droits **estimés**, check-list documentaire.
- **Couplage escrow** : la livraison confirmée déclenche le dénouement.

### Roadmap (visé, non construit)
- **API multi-transporteurs** : cotation temps réel, comparaison automatique.
- **Calcul automatique des droits** par HS code/pays (barème TEC).
- **Assurance fret** intégrée à la cotation.
- **Tracking temps réel** (GPS/EDI) au-delà des statuts manuels.
- **Extension corridors** : ouverture progressive (Cotonou, Douala, Lagos…)
  une fois le premier corridor rentable et fiabilisé.

> Règle anti-façade : tant qu'un corridor n'a pas servi une vraie expédition
> dédouanée, il reste **roadmap**, pas MVP — même si la grille tarifaire existe.

---

## 9) Moat & lecture investisseur

**Pourquoi c'est défendable** (et pourquoi ce n'est pas qu'un calculateur de
fret) :

1. **Réseau de transitaires** — des accords opérationnels sur des corridors
   précis ne se copient pas par un concurrent qui « ajoute un champ logistique ».
   C'est du terrain, des contrats, de la fiabilité prouvée.
2. **Corridors maîtrisés + hub marocain** — adosser la desserte ouest-africaine à
   **Tanger Med** (10,2 M EVP) et aux axes **Abidjan/Dakar(Ndayane)** donne un
   avantage structurel de coût et de délai, concentré là où la demande existe.
3. **Capture du post-match** — en couplant logistique + dédouanement + **escrow**,
   MineGrid détient l'étape qui **conclut et sécurise** la transaction. Le
   concurrent annonces s'arrête au match ; MineGrid encaisse au dénouement.
4. **Effet données** — chaque `logistics_quotes` et `customs_cases` enrichit un
   référentiel propriétaire (coûts réels par corridor, droits réels par HS code/
   pays) qui **améliore la précision des devis futurs** et nourrit l'estimation.
   La donnée logistique est un actif cumulatif, pas un coût.

**Modèle économique, sans façade.** MineGrid prend une **marge d'apport** sur des
devis partenaires — **pas de float de fret, pas d'actifs lourds, pas de bilan
transport**. C'est un modèle **capital-léger** : la valeur est dans
l'orchestration, le réseau et la donnée, pas dans la possession de camions ou de
navires. L'asset-lourd reste chez les partenaires ; le défendable reste chez
MineGrid.
