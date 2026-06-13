# MineGrid Trust Layer — vérification & score de confiance

> **Actif n°1.** Rendre **visible et comparable** la fiabilité d'un vendeur. C'est
> exactement ce que le canal informel (WhatsApp) et les marketplaces de listing
> (Via Mobilis / Mascus) n'offrent pas. Le Trust Layer transforme une réputation
> invisible et non transférable en un **signal public, auditable et porté par la
> plateforme** : un badge + un score 0-100 attaché à chaque vendeur et à chaque machine.
>
> Document dérivé de `NEXTGEN_TRANSFORMATION.md` (§3, actif 1 ; Phase 3). Code et
> schéma réels : `sql/nextgen/0001_trust_and_inspection.sql`, `src/nextgen/trust/`.

---

## 1. Problème & thèse

**La confiance est la friction n°1 du marché de l'occasion lourde en Afrique francophone.**
Acheter une pelle ou un tombereau d'occasion, c'est engager 30 000 à 400 000 € sur :

- un **vendeur inconnu**, sans personnalité juridique vérifiable (RC/ICE, NIF) ;
- une **machine** dont on ignore l'historique réel (heures-moteur trafiquées, organe
  HS, litige de propriété, gage non levé) ;
- un **paiement** souvent demandé d'avance, par virement ou mobile money, **sans recours**.

Le canal dominant aujourd'hui est WhatsApp : massif, rapide, mais **structurellement
opaque**. Les schémas de fraude y sont documentés et récurrents :

1. **Vendeur fantôme** — acompte demandé pour « bloquer » la machine, puis disparition.
2. **Machine inexistante** — photos volées à une annonce européenne, engin jamais vu.
3. **Falsification d'état** — heures-moteur remises à zéro, défauts masqués avant photo.
4. **Double vente / litige de propriété** — même engin « vendu » à plusieurs acheteurs.
5. **Usurpation d'identité** — faux profils d'entreprises établies.

Aucun de ces risques n'est adressé par un **site d'annonces** : afficher plus de
listings n'augmente pas la confiance, ça augmente la surface de fraude. La thèse
NextGen est inverse : **le produit n'est pas l'annonce, c'est la garantie de fiabilité
qui l'entoure.** Le Trust Layer est la couche fondatrice ; Inspection (`INSPECTION.md`)
et Escrow (`ESCROW.md`) s'y branchent pour fermer la boucle vente → preuve → paiement sécurisé.

**Différenciation mesurable.** Un acheteur qui compare deux pelles équivalentes verra
`Vendeur de confiance · 72` d'un côté et `Non vérifié` de l'autre. Ce signal — absent
de WhatsApp et des marketplaces de listing — est l'unité de valeur de la plateforme.

---

## 2. Modèle de données

Trois tables portent le Trust Layer (extrait de `0001_trust_and_inspection.sql`). Règle
transversale héritée de l'audit : **les écritures sensibles sont serveur uniquement**
(`service_role` / Edge Functions). Le client **lit** (badge public) et **soumet** des
pièces (`status='pending'`). Il n'écrit **jamais** le score ni n'approuve une vérification.

### `trust_profiles` — un profil de confiance par compte

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → `auth.users` | `on delete cascade` ; unique `(user_id, entity_type)` |
| `entity_type` | text | `seller` \| `buyer` \| `company` \| `inspector` (défaut `seller`) |
| `legal_name`, `country` | text | dénomination légale, pays |
| `trust_score` | int 0-100 | **calculé serveur** ; `check (between 0 and 100)` |
| `trust_tier` | text | `unverified` \| `basic` \| `verified` \| `trusted` \| `elite` |
| `verified_at` | timestamptz | horodatage de la dernière promotion de tier |

**RLS.** `SELECT` public (`anon, authenticated` → `using (true)`) : le badge est un signal
public. **Aucune policy** `insert/update/delete` → réservé `service_role`. Verrou explicite :
`revoke insert, update, delete ... from anon, authenticated`.

### `verifications` — pièces vérifiables soumises par le propriétaire

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `trust_profile_id` | uuid → `trust_profiles` | `on delete cascade` |
| `kind` | text | `identity` \| `company_registration` \| `tax_id` \| `bank_account` \| `address` \| `machine_document` |
| `status` | text | `pending` \| `approved` \| `rejected` (défaut `pending`) |
| `evidence_url` | text | objet **privé** (Storage) ; URL signée générée côté serveur |
| `reviewer_id`, `review_notes`, `reviewed_at` | | renseignés à la revue back-office |

**RLS.** `SELECT` propriétaire (jointure `trust_profiles.user_id = auth.uid()`).
`INSERT` propriétaire **avec `with check (status = 'pending' and ...)`** : impossible de
s'auto-approuver. Pas de policy `UPDATE` client → l'approbation/rejet est `service_role`.
Verrou : `revoke update, delete ... from anon, authenticated`.

### `machine_history` — historique vérifiable d'une machine

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `machine_id` | uuid | référence logique vers l'annonce |
| `event_type` | text | `listed` \| `price_change` \| `inspected` \| `sold` \| `owner_change` \| `maintenance` \| `dispute` |
| `details` | jsonb | charge utile par événement (défaut `{}`) |
| `recorded_by` | uuid → `auth.users` | acteur de l'événement (nullable) |
| `source` | text | `platform` \| `inspector` \| `scraper` \| `partner` (défaut `platform`) |

**RLS.** `SELECT` public (transparence : l'historique d'une machine est un argument de
confiance, ex. « inspectée le 04/03, grade B »). Écriture `service_role`/inspecteur
serveur (`revoke insert, update, delete ... from anon, authenticated`). Cette table est
**event-sourcée** : elle nourrit à la fois le badge (événements `dispute`, `inspected`)
et la Data Platform (`platform_events`, cf. `DATA_PLATFORM.md`).

---

## 3. Score de confiance (0-100)

Le score est calculé par une fonction **pure, déterministe et testée** —
`src/nextgen/trust/computeTrustScore.ts` (couverte par `computeTrustScore.test.ts`).
Pure = mêmes signaux → même score, et chaque point est **attribué à sa source** via
`breakdown`, donc explicable à l'utilisateur (« il vous manque la vérification bancaire :
+10 »). **En production cette fonction tourne côté serveur** (Edge Function / cron) ; le
client ne fait que lire `trust_profiles.trust_score`.

### Barème (max 100)

| Composante | Détail | Plafond |
|---|---|---|
| **Vérifications** | identité **15**, RC/société **15**, fiscal (NIF) **10**, bancaire **10**, adresse **5**, document machine **5** | **60** |
| **Inspections** | `taux de réussite × 15`, soit `(inspections_passées / inspections_totales) × 15` | **15** |
| **Transactions** | `min(transactions complétées, 10)` | **10** |
| **Ancienneté** | `min(âge_compte_jours / 180, 1) × 5` | **5** |
| **Pénalité litiges** | **−10 par litige** (`dispute`) | — (peut faire chuter le total) |

Score brut = somme des composantes − pénalités, puis **borné `[0, 100]`**. Les
vérifications sont **dédupliquées par `kind`** : soumettre deux fois « identité » ne
compte qu'une fois.

### Tiers et **plancher de sécurité**

| Tier | Seuil de score | Libellé badge (UI) |
|---|---|---|
| `elite` | ≥ 80 | Confiance Élite |
| `trusted` | ≥ 60 | Vendeur de confiance |
| `verified` | ≥ 40 | Vérifié |
| `basic` | ≥ 20 | Identité partielle |
| `unverified` | < 20 | Non vérifié |

**Plancher (règle anti-contournement).** Sans **vérification d'identité approuvée**, le
tier est **plafonné à `basic`**, quel que soit le score. Un acteur non identifié ne peut
pas être « Vérifié » ou mieux, même en accumulant transactions et ancienneté. (Voir
`tierForScore()` : si `!approved.has('identity')` et tier calculé ∈ {verified, trusted,
elite} → retourne `basic`.)

### Exemple chiffré (cas réel, issu des tests)

Vendeur pleinement vérifié, 4 inspections réussies sur 4, 10 transactions complétées,
compte âgé d'1 an, 0 litige :

```
Vérifications  : identity 15 + company 15 + tax 10 + bank 10 + address 5 + machine_doc 5 = 60
Inspections    : (4 / 4) × 15                                                            = 15
Transactions   : min(10, 10)                                                             = 10
Ancienneté     : min(365/180, 1) × 5                                                     = 5
Litiges        : 0 × (−10)                                                               = 0
                                                                              ─────────────
Score = 60 + 15 + 10 + 5 = 90  →  tier ELITE (≥ 80, identité présente)
```

Même vendeur, **mais 1 litige** : `90 − 10 = 80` → reste `elite` (limite). **2 litiges** :
`90 − 20 = 70` → `trusted`. Même vendeur **sans la pièce d'identité** (les 5 autres
vérifs = 45 pts ; score 45+15+10+5 = 75) → tier calculé `trusted` **rabattu à `basic`**
par le plancher.

### Recalcul : **serveur uniquement, jamais client**

Le score est un **état dérivé recalculé par le serveur**, jamais poussé par le client
(le client n'a aucun droit d'écriture sur `trust_profiles`). Deux déclencheurs :

1. **Événementiel** — l'Edge Function `approve-verification` recalcule immédiatement le
   profil concerné après chaque approbation/rejet (latence faible, le badge bouge dès la revue).
2. **Cron de réconciliation** — un job périodique (`recompute-trust-score`, ~nuit)
   recalcule l'ensemble des profils touchés par un événement depuis le dernier passage
   (nouvelle inspection certifiée, transaction `sold`, nouveau `dispute`, gain
   d'ancienneté). Garantit que les composantes **temps-dépendantes** (ancienneté) et les
   signaux asynchrones (inspection, litige) sont intégrés sans action utilisateur.

Le serveur agrège les **signaux bruts** (`TrustSignals` : `approvedVerifications`,
`inspectionsPassed/Total`, `completedTransactions`, `disputes`, `accountAgeDays`) depuis
`verifications` (status `approved`), `inspection_reports` (certifiés), l'historique
transactionnel/escrow et `machine_history` (`dispute`), passe le tout à `computeTrustScore`,
puis écrit `trust_score`, `trust_tier` et `verified_at` avec le `service_role`.

---

## 4. Workflow de vérification

```
 Vendeur (client)                Back-office (service_role)            Système
 ───────────────                 ──────────────────────────           ───────
 1. Upload pièce  ───────────▶   (Storage privé, URL signée serveur)
    submitVerification()
    INSERT verifications
    status='pending' (RLS)

 2. (attente)                ◀── 3. File de revue
                                    (idx partiel status='pending')
                                 4. Examen + décision
                                    approve-verification:
                                      UPDATE status=approved|rejected
                                      reviewer_id, reviewed_at, notes
                                                │
                                                ▼
                                 5. Recalcul du score  ──────────────▶  computeTrustScore
                                    (service_role)                       → trust_score/tier
                                                │                        → verified_at
                                                ▼
 7. Badge mis à jour  ◀───────── 6. UPDATE trust_profiles (service_role)
    (lecture publique)               + machine_history si pertinent
```

**Étapes.**
1. **Soumission** — le vendeur téléverse la pièce (CNI/passeport, extrait RC/ICE,
   attestation NIF, RIB, justificatif d'adresse, carte grise/facture machine). Le fichier
   va dans un **bucket privé** ; `evidence_url` n'est résolu qu'en **URL signée côté
   serveur** au moment de la revue (le contenu sensible n'est jamais exposé publiquement).
2. **Mise en file** — l'insert crée une ligne `pending`. L'index partiel
   `idx_verifications_status ... where status='pending'` rend la file de revue performante.
3. **Revue back-office** — un opérateur (rôle interne, `service_role`) ouvre la pièce,
   vérifie l'authenticité (croisement registre, cohérence nom/entité).
4. **Décision** — `approved` ou `rejected` + `review_notes`, `reviewer_id`, `reviewed_at`.
5. **Recalcul** — déclenché immédiatement (cf. §3) ; les vérifs approuvées entrent dans `TrustSignals`.
6. **Mise à jour profil** — `trust_score`/`trust_tier`/`verified_at` réécrits ; un
   événement `machine_history` peut être émis (ex. première vérification ↔ machine listée).
7. **Badge** — le `TrustBadge` public reflète le nouveau tier sans action du vendeur.

C'est une **opération humaine assistée** (MVP) : la barrière n'est pas le code mais la
capacité à vérifier réellement des pièces sur le terrain (cf. §9).

---

## 5. APIs & Edge Functions

| Surface | Acteur | Rôle | Écrit |
|---|---|---|---|
| `trustService.getTrustProfile(userId)` | client | lit le badge public d'un vendeur | — |
| `trustService.getMyTrustProfile()` | client | profil de confiance de l'utilisateur connecté | — |
| `trustService.submitVerification(profileId, kind, url)` | client | **soumet** une pièce (`status='pending'`) | `verifications` (RLS) |
| `trustService.getMyVerifications(profileId)` | client | liste ses propres pièces et leur statut | — |
| `approve-verification` (Edge) | **serveur** | approuve/rejette + déclenche recalcul | `verifications`, `trust_profiles` |
| `recompute-trust-score` (Edge/cron) | **serveur** | recalcule en masse les profils touchés | `trust_profiles`, `machine_history` |

**Client (déjà livré, `src/nextgen/trust/trustService.ts`).** Quatre fonctions, **lecture
+ soumission seulement**. `submitVerification` insère avec `status: 'pending'` — la RLS
**force** ce statut (`with check`), donc même un client malveillant ne peut pas
s'auto-approuver. `getTrustProfile` lit les colonnes publiques du badge.

**Serveur (à implémenter, Edge Functions Deno + `service_role`).**

- **`approve-verification`** — entrée `{ verification_id, decision, notes }`. Vérifie
  l'authz opérateur, met à jour la ligne, **recalcule le profil concerné** via
  `computeTrustScore`, écrit `trust_profiles`. Idempotente (rejouer la même décision
  n'altère pas l'état). Émet un `platform_event`.
- **`recompute-trust-score`** — déclenchée par cron (réconciliation) ou par un événement
  (`sold`, `dispute`, inspection certifiée). Recharge les `TrustSignals`, recalcule,
  n'écrit que si le score/tier change (évite les écritures inutiles), journalise le
  `breakdown` pour audit.

> Même patron que le correctif paiement de la remédiation Phase 1 (webhook signé +
> RLS) : **le client propose, le serveur dispose et écrit.**

---

## 6. UI

Composant livré : `src/nextgen/trust/TrustBadge.tsx` — badge **accessible**
(`role="status"`, `aria-label` complet incluant le score, p. ex. « Niveau de confiance :
Vendeur de confiance, score 72 sur 100 »). Tailles `sm`/`md`, code couleur par tier
(émeraude=élite, vert=trusted, bleu=verified, ambre=basic, gris=unverified), icônes
bouclier (check/alert/question).

**Points d'affichage.**

1. **Fiche machine** — `TrustBadge` du vendeur à côté du prix + bloc « historique vérifié »
   alimenté par `machine_history` (`listed`, `inspected`, `price_change`). Réponse directe
   au « est-ce que ce vendeur et cette machine sont fiables ? ».
2. **Vitrine vendeur** — `TrustBadge size="md"` + `score` en en-tête, et une ventilation
   du `breakdown` (« Identité ✓ · Société ✓ · Bancaire ✗ ») pour expliquer le score.
3. **Page « Mes vérifications »** (espace vendeur) — liste via `getMyVerifications` :
   chaque `kind` avec son statut (`pending`/`approved`/`rejected` + notes), un CTA
   d'upload pour les pièces manquantes, et le **gain de points** attendu par pièce
   (pédagogie : « +10 si bancaire approuvée »). Affiche le plancher : « Vérifiez votre
   identité pour dépasser le niveau Identité partielle ».
4. **Back-office de revue** (interne) — file `pending` (index partiel), aperçu de la pièce
   via URL signée, boutons Approuver/Rejeter + notes → appelle `approve-verification`.

**Honnêteté produit (règle anti-façade, `NEXTGEN_TRANSFORMATION.md` §5).** Tant qu'un
back-office de revue n'est pas branché, l'UI **n'affiche pas** de badge vérifié fictif :
un vendeur sans vérification approuvée est `unverified`, point. Pas de score `Math.random`,
pas de « vérifié » décoratif.

---

## 7. KPIs

| KPI | Définition | Cible pilote |
|---|---|---|
| **% vendeurs vérifiés** | profils avec ≥ 1 vérif `approved` / total vendeurs actifs | ≥ 60 % au corridor pilote |
| **% identité vérifiée** | profils franchissant le plancher (tier ≥ `verified`) | ≥ 40 % |
| **Délai de vérification** | médiane `reviewed_at − created_at` par pièce | < 48 h |
| **Taux d'approbation** | `approved / (approved + rejected)` | suivi (signale fraude/UX upload) |
| **Score médian vendeur** | médiane `trust_score` des vendeurs actifs | en hausse trimestrielle |
| **Corrélation score → conversion** | taux de contact/transaction par bucket de tier | **monotone croissante** |
| **Litiges post-vente par tier** | `dispute` / ventes, segmenté par tier | décroissant avec le tier |

**KPI nord.** La **corrélation score → conversion** : si les vendeurs `trusted/elite`
convertissent significativement mieux que `unverified`, le Trust Layer est **prouvé**
comme moteur de GMV — l'argument central pour le passage à >75/100 (`NEXTGEN_TRANSFORMATION.md` §8).

---

## 8. MVP vs roadmap

**MVP (réel, livrable au pilote — Phase 3).**
- Tables `trust_profiles` / `verifications` / `machine_history` + RLS (`0001`, livré).
- `computeTrustScore` (pur, testé) + `TrustBadge` (accessible) + `trustService` (livré).
- Vérifications **manuelles** prioritaires : **identité** + **RC/société** (les deux
  pièces à plus fort signal et plus haut poids, 15+15). Revue back-office humaine.
- Edge Functions `approve-verification` + `recompute-trust-score` (**à implémenter** :
  c'est le maillon serveur qui reste à brancher pour passer de « schéma+code » à « opérationnel »).
- Badge affiché sur fiche machine + vitrine vendeur ; page « Mes vérifications ».

**Roadmap (explicitement non livré).**
- **Vérification automatisée par API registres** — connexion aux registres de commerce
  (RCCM/OHADA, ICE Maroc, etc.) et bases fiscales pour valider RC/NIF **sans opérateur**.
- **KYB / KYC renforcé** — fournisseurs d'identité (liveness, OCR pièce, contrôle PEP/sanctions).
- **Vérification bancaire** par micro-dépôt ou agrégation.
- **Signaux d'inspection & escrow temps réel** — intégration directe des `inspection_reports`
  certifiés et de l'historique escrow dans le recalcul (renforce inspections/transactions).
- **Décroissance temporelle** — pondération qui érode les vérifs très anciennes / réclame
  une re-vérification périodique (anti-réputation figée).
- **Score acheteur** — `entity_type='buyer'` exploité pour fiabiliser la demande (lutte
  contre les faux acheteurs / acomptes fantômes).

> **Règle anti-façade.** Le MVP livré est testé ; tout ce qui précède en roadmap est
> marqué non livré. Aucun module n'est « actif » tant que son workflow serveur n'est pas branché.

---

## 9. Moat & angle investisseur

**Le fossé n'est pas le logiciel.** `computeTrustScore` est ~100 lignes : copiable en un
après-midi. Le badge et le schéma aussi. Ce qui **n'est pas copiable** :

1. **Les opérations de vérification.** Vérifier réellement une identité, un RC, une carte
   grise, une machine **au Sénégal, en Côte d'Ivoire, au Maroc** demande des process, des
   opérateurs, des partenaires registres et un réseau d'inspecteurs au sol
   (`INSPECTION.md`). C'est une **barrière opérationnelle** qu'un acteur SEO européen
   (Mascus/Via Mobilis) ne montera pas — elle ne « scale » pas par le code.
2. **La donnée de confiance propriétaire.** Chaque vérification approuvée, chaque
   inspection certifiée, chaque `dispute`, chaque transaction `sold` enrichit
   `trust_profiles` et `machine_history`. Ce **graphe de confiance** (qui est fiable, quelle
   machine a quel passé) est un actif **qui s'auto-renforce** : plus de transactions → plus
   de signaux → scores plus justes → meilleure confiance → plus de transactions. Il
   alimente directement la détection de fraude et le scoring IA (`AI_STRATEGY.md`).
3. **L'effet de plateforme.** Le badge n'a de valeur que **porté par un tiers neutre**. Un
   vendeur ne peut pas s'auto-décerner « Vendeur de confiance » sur WhatsApp ; sur MineGrid,
   le tiers de confiance, c'est la plateforme — et la RLS (`service_role`) garantit que ce
   signal **n'est pas falsifiable** côté client. C'est la définition même d'une infrastructure
   de confiance, pas d'un listing.

**Composabilité.** Le Trust Layer est la **brique de base** : Inspection le nourrit (preuve
physique → points + `machine_history.inspected`), Escrow s'y conditionne (séquestre libéré
sur inspection OK → réduit le risque → score), Finance s'y adosse (dossiers de vendeurs/
acheteurs scorés). Le score de confiance devient la **monnaie de risque** commune à tous
les modules transactionnels.

**Ce que ça prouve à un investisseur :** MineGrid ne vend pas de l'audience, il **fabrique
de la confiance vérifiable** sur un marché où elle est le verrou n°1 — avec un moat
opérationnel et data, pas logiciel, et une boucle qui se renforce à chaque transaction.
