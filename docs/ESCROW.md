# MineGrid Escrow — séquestre conditionné à l'inspection et à la livraison

> Statut : **spécification NextGen (pré-build)**. Ce document décrit le module Escrow tel
> qu'il sera implémenté. La migration `sql/nextgen/0002_escrow_and_finance.sql` et les Edge
> Functions associées **n'existent pas encore** — voir §10 (MVP vs roadmap) pour le périmètre
> réellement livré au lancement. Le module s'appuie sur le socle déjà en production :
> `sql/transaction_platform_core.sql` (table `transaction_cases`, machine d'état du dossier)
> et le pattern de webhook signé éprouvé dans `supabase/functions/stripe-webhook/index.ts`.

---

## RÈGLE D'OR (non négociable)

**MineGrid ne porte JAMAIS les fonds ni le risque de crédit.** Les fonds séquestrés sont
détenus par un **PSP partenaire** (Stripe Connect / Flutterwave / Peach Payments), sur des
comptes réglementés. MineGrid est **orchestrateur d'état + workflow**, jamais dépositaire.
Cette règle découle directement des effondrements de Kobo360 et Lori Systems, qui ont brûlé
leur cash en absorbant le working capital de la chaîne logistique. MineGrid se rémunère par
un **service fee sur transaction réussie**, jamais sur le float, jamais sur du crédit porté.

---

## 1. Problème & thèse

### Le problème concret
L'achat transfrontalier d'un engin lourd en Afrique francophone (pelle, chargeuse, foreuse,
camion-benne) se heurte à un mur de défiance au moment de payer :

- **Mobile money inadapté** : les plafonds (souvent < 5 000 € / transaction, parfois moins)
  rendent impossible le règlement d'un engin à 50–300 k€. Multiplier les transactions est
  coûteux, traçable difficilement, et expose au reversal.
- **Virement international risqué** : une fois le virement parti vers un vendeur dans un autre
  pays, l'acheteur n'a **aucun recours** si la machine n'existe pas, n'est pas conforme, ou
  n'est jamais expédiée.
- **Arnaque à l'acompte avant inspection** : le schéma le plus documenté du secteur. Le
  « vendeur » exige un acompte (10–30 %) pour « bloquer » la machine ou « payer le
  transitaire », puis disparaît. L'acheteur a payé avant toute inspection physique.

Résultat : les acheteurs sérieux refusent de payer à distance, les vendeurs honnêtes ne
peuvent pas prouver leur bonne foi, et la transaction **se règle en cash, hors plateforme**,
souvent après un déplacement physique coûteux et tardif.

### La thèse
**Le paiement est le boulevard de l'escrow.** Le canal informel (virement direct, cash, mobile
money fractionné) n'offre **aucun recours** : c'est sa faille structurelle. Le séquestre
conditionné transforme cette faille en proposition de valeur :

1. L'acheteur finance, mais **MineGrid ne touche pas les fonds** — le PSP les bloque.
2. Le vendeur voit que l'argent **existe et est bloqué** : preuve de sérieux sans risque.
3. Les fonds ne sont libérés **qu'après inspection certifiée ET livraison confirmée**.

Effet de bord stratégique — **anti-désintermédiation** : tant que l'escrow est le seul endroit
où le recours existe, **la valeur disparaît si la transaction sort de la plateforme**. Le
séquestre verrouille la transaction on-platform sans clause coercitive : l'acheteur n'a aucune
raison rationnelle de renoncer à sa protection, le vendeur aucune raison de renoncer à la
preuve de fonds. C'est le mécanisme de rétention le plus défendable du produit.

---

## 2. Machine d'état détaillée

Une transaction escrow est une machine d'état stricte. **Toute transition est écrite côté
serveur** (webhook PSP signé → `service_role`), jamais par le client.

### Diagramme texte

```
                          ┌──────────────────────────────────────────────┐
                          │                                              │
   [acheteur initie]      │                                              ▼
        │                 │                                        ┌───────────┐
        ▼                 │                                        │ cancelled │
   ┌─────────┐   PSP confirme blocage   ┌────────┐                └───────────┘
   │ created │ ───────────────────────▶ │ funded │                  ▲
   └─────────┘   (webhook funds_held)   └────────┘                  │ (avant funded
        │                                    │                      │  uniquement)
        │ expiration / annulation            │ inspection certifiée │
        │ avant blocage                       │ OK (inspection_report_id)
        └─────────────────────────────────┐  ▼
                                           │ ┌────────────────────┐
                                           │ │ inspection_passed  │
                                           │ └────────────────────┘
                                           │      │
                                           │      │ livraison confirmée
                                           │      │ (2 parties OU preuve transporteur)
                                           │      ▼
                                           │ ┌───────────┐   conditions remplies   ┌──────────┐
                                           │ │ delivered │ ──────────────────────▶ │ released │  ← fonds → vendeur
                                           │ └───────────┘   (release_conditions)  └──────────┘
                                           │
        inspection KO / livraison non conforme / litige
                                           │
                                           ▼
                                    ┌──────────┐   résolution remboursement   ┌──────────┐
                                    │ disputed │ ───────────────────────────▶ │ refunded │  ← fonds → acheteur
                                    └──────────┘   résolution libération       └──────────┘
                                           │        (→ released)
                                           └──────────────────────────────────▶ released
```

### États (colonne `status`)

| État | Signification | Détenteur des fonds |
|------|---------------|---------------------|
| `created` | Transaction ouverte, en attente de financement | aucun (rien bloqué) |
| `funded` | PSP a confirmé le blocage des fonds | **PSP** (séquestre) |
| `inspection_passed` | Inspection certifiée conforme | PSP |
| `delivered` | Livraison confirmée (2 parties ou preuve transporteur) | PSP |
| `released` | Fonds libérés vers le vendeur | vendeur |
| `refunded` | Fonds remboursés vers l'acheteur | acheteur |
| `disputed` | Litige ouvert, fonds gelés en attente de résolution | PSP (gelé) |
| `cancelled` | Annulé avant tout blocage de fonds | aucun |

### Conditions de libération (`release_conditions` jsonb)

Valeur par défaut : `{"inspection": true, "delivery": true}`. La libération (`→ released`)
n'est autorisée **que si toutes les conditions actives sont satisfaites** :

- `inspection: true` → exige `status` ayant atteint `inspection_passed` (rattaché à un
  `inspection_report_id` non nul, certifié par le module Inspection).
- `delivery: true` → exige confirmation de livraison (passage par `delivered`).

Le `jsonb` permet d'assouplir par transaction (ex. machine déjà sur site de l'acheteur →
`{"inspection": true, "delivery": false}`) **sans changer le code** : le moteur de libération
lit les conditions, ne les présume jamais.

### Transitions terminales
`released`, `refunded`, `cancelled` sont **terminales** : aucune sortie. `disputed` est le seul
état non terminal réversible, et il ne se résout que vers `released` ou `refunded`.

---

## 3. Modèle de données

Migration cible : `sql/nextgen/0002_escrow_and_finance.sql` (à créer). Deux tables + un journal
d'événements append-only. Cohérent avec le socle `transaction_cases` existant : une transaction
escrow **référence** un dossier, elle ne le remplace pas.

### `escrow_transactions`

```sql
create table public.escrow_transactions (
  id                  uuid primary key default gen_random_uuid(),
  machine_id          uuid not null,
  buyer_id            uuid not null references auth.users (id),
  seller_id           uuid not null references auth.users (id),
  amount              numeric not null check (amount > 0),
  currency            text   not null,
  status              text   not null default 'created'
    check (status in (
      'created', 'funded', 'inspection_passed', 'delivered',
      'released', 'refunded', 'disputed', 'cancelled'
    )),
  inspection_report_id uuid,           -- lien vers le module Inspection
  provider            text not null
    check (provider in ('stripe_connect', 'flutterwave', 'peach')),
  provider_ref        text,            -- id PaymentIntent / transfer côté PSP
  release_conditions  jsonb not null default '{"inspection": true, "delivery": true}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

**RLS** :
- Acheteur **et** vendeur : `SELECT` sur leurs propres transactions
  (`buyer_id = auth.uid() OR seller_id = auth.uid()`).
- **Aucune** policy `INSERT/UPDATE` pour `authenticated` sur les transitions d'état :
  toutes les écritures de `status` passent par `service_role` (webhook PSP signé). Le client
  ne peut jamais faire avancer la machine d'état lui-même.

### `escrow_events` (append-only)

```sql
create table public.escrow_events (
  id          uuid primary key default gen_random_uuid(),
  escrow_id   uuid not null references public.escrow_transactions (id) on delete cascade,
  event_type  text not null,          -- 'funds_held', 'inspection_passed', 'delivery_confirmed', ...
  actor_id    uuid references auth.users (id),  -- null si acteur = PSP/système
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
```

**RLS** : les parties (acheteur, vendeur) ont `SELECT`. **Aucun** `UPDATE`/`DELETE` exposé :
le journal est **append-only**, garant de l'auditabilité (preuve de la chronologie en cas de
litige). Les insertions d'événements PSP se font en `service_role`.

> **Cohérence avec l'existant** : `escrow_events` est l'équivalent, côté finance, de
> `transaction_events` (déjà en prod). On pourra projeter chaque `escrow_event` en
> `transaction_event` sur le dossier parent pour une timeline unifiée acheteur/vendeur.

---

## 4. Architecture PSP — MineGrid n'encaisse pas

### Principe
Les fonds transitent et sont séquestrés **chez le PSP**, sur des comptes réglementés. MineGrid
n'ouvre **aucun** compte de cantonnement, ne détient **aucun** solde client. Le champ
`provider` (`stripe_connect` / `flutterwave` / `peach`) identifie l'opérateur du séquestre par
transaction ; `provider_ref` stocke la référence de l'objet financier côté PSP (PaymentIntent,
transfer, virement).

### Flux de fonds

```
  Acheteur ──(1) finance──▶  PSP (compte séquestre réglementé)
                                  │
                                  │  fonds BLOQUÉS — MineGrid orchestre l'état, ne touche rien
                                  │
        conditions remplies       ▼                    conditions non remplies
   (inspection + livraison) ──▶ PSP libère ──▶ Vendeur │ ──▶ PSP rembourse ──▶ Acheteur
                                                       │
                              service fee MineGrid prélevé sur transaction réussie
                              (application_fee côté PSP, jamais via float)
```

Avec **Stripe Connect**, MineGrid est la *platform* : l'acheteur paie, les fonds sont retenus
(*separate charges & transfers* / *destination charge* avec *transfer* différé), et la
libération déclenche le `transfer` vers le compte connecté du vendeur. Le service fee MineGrid
est l'`application_fee_amount` — prélevé **par Stripe au moment de la libération**, jamais par
un mouvement sur un compte MineGrid.

### Webhook signé → `service_role` écrit l'état

C'est le cœur de la règle « écritures d'état = serveur ». Le pattern est **déjà éprouvé** dans
`supabase/functions/stripe-webhook/index.ts` (activation d'abonnement) :

1. Le PSP appelle l'Edge Function `escrow-webhook` après chaque événement financier.
2. La fonction **vérifie la signature** de l'événement (ex. `STRIPE_WEBHOOK_SECRET` via
   `stripe.webhooks.constructEventAsync`). Signature invalide → `400`, aucune écriture.
3. Seulement alors, la fonction écrit la transition `status` avec la **clé `service_role`**
   (jamais l'anon key, jamais le JWT du client).
4. Déploiement `--no-verify-jwt` : le PSP ne porte pas de JWT Supabase, **l'authentification
   est la signature PSP**, exactement comme l'actuel `stripe-webhook`.

### Idempotence (obligatoire)

Les PSP **rejouent** les webhooks (retries, doublons réseau). Chaque transition doit être
idempotente :

- **Clé d'idempotence côté création** : à l'image de `create-payment` qui utilise
  `idempotencyKey: ${userId}:${planId}`, la création d'un PaymentIntent escrow utilisera une
  clé déterministe par transaction (`escrow:${escrow_id}`).
- **Idempotence côté webhook** : une transition rejouée ne doit jamais empiler ni régresser.
  On garde l'`event.id` du PSP dans `escrow_events.payload`, on ignore un `event.id` déjà vu,
  et la transition est **conditionnée à l'état courant** (`UPDATE ... WHERE status = <attendu>`),
  de sorte qu'un rejeu sur un état déjà avancé est un no-op.

---

## 5. Workflow bout-en-bout

```
ACHETEUR                MINEGRID (orchestrateur)            PSP                 VENDEUR
   │  ouvre escrow ─────────▶ create-escrow                  │                    │
   │                          insère escrow_transactions     │                    │
   │                          status = created               │                    │
   │  finance ────────────────────────────────────────────▶ bloque les fonds      │
   │                                                         │                    │
   │                        escrow-webhook ◀──── funds_held ─┤                    │
   │                          (signature vérifiée)           │                    │
   │                          service_role: → funded         │                    │
   │                          event: funds_held              │   « fonds bloqués » ▶ (preuve de sérieux)
   │                                                         │                    │
   │   [Module Inspection : inspecteur certifié évalue la machine]               │
   │                        escrow-webhook / RPC interne                          │
   │                          → inspection_passed            │                    │
   │                          inspection_report_id rattaché  │                    │
   │                          event: inspection_passed       │                    │
   │                                                         │                    │
   │  confirme livraison ───▶ confirm-delivery               │                    │
   │   (OU preuve transporteur : POD/CMR)                    │                    │
   VENDEUR confirme aussi ─▶  confirm-delivery               │                    │
   │                          quand les 2 OK OU preuve → delivered                │
   │                          event: delivery_confirmed      │                    │
   │                                                         │                    │
   │                          conditions (release_conditions) remplies ?          │
   │                          ── oui ──▶ déclenche libération ▶ transfer ────────▶ reçoit les fonds
   │                        escrow-webhook ◀── transfer.paid ┤                    │
   │                          service_role: → released       │                    │
   │                          event: released                │                    │
```

### Chemin nominal
acheteur finance → fonds bloqués chez PSP → inspection certifiée OK → livraison confirmée par
les **deux** parties (ou preuve transporteur : POD signé / CMR) → libération vers le vendeur.

### Chemin remboursement
Inspection KO, ou livraison non conforme / non effectuée dans le délai → la transition cible est
`refunded` : le PSP rembourse l'acheteur. MineGrid ne « rend » pas l'argent (il ne l'a jamais
eu) — il **ordonne au PSP** le remboursement via la résolution.

### Gestion de litige
N'importe quelle partie peut ouvrir un litige (`open-dispute`) tant que la transaction n'est pas
terminale. Effet : `→ disputed`, fonds **gelés chez le PSP**. La résolution (assistée par un
admin MineGrid au MVP, cf. §10) tranche entre :
- `→ released` (litige rejeté, conditions jugées remplies), ou
- `→ refunded` (litige fondé).

Chaque étape du litige est tracée dans `escrow_events` (append-only) : le journal est la
**preuve opposable** de la chronologie.

---

## 6. APIs / Edge Functions

Toutes déployées comme Edge Functions Supabase, alignées sur les conventions existantes
(`supabase/functions/*`). **Distinction critique** : les fonctions appelées par le **client**
authentifient un JWT et **n'écrivent jamais `status`** ; seul `escrow-webhook` (signé PSP) écrit
les transitions en `service_role`.

| Fonction | Appelée par | Auth | Écrit `status` ? | Rôle |
|----------|-------------|------|------------------|------|
| `create-escrow` | acheteur (front) | JWT Supabase | non (insère `created`) | crée la transaction + PaymentIntent escrow (clé d'idempotence), renvoie le `client_secret` |
| `escrow-webhook` | **PSP** | **signature PSP** | **oui (`service_role`)** | unique point d'écriture des transitions ; vérifie signature, idempotent, append `escrow_events` |
| `confirm-delivery` | acheteur **et** vendeur (front) | JWT Supabase | non (enregistre une confirmation) | enregistre la confirmation de chaque partie / preuve transporteur ; déclenche `→ delivered` **côté serveur** quand quorum atteint |
| `open-dispute` | acheteur ou vendeur (front) | JWT Supabase | non directement | ouvre le litige → demande de gel ; la bascule `→ disputed` est confirmée côté serveur |

- `create-escrow` : reprend le squelette de `create-payment` (CORS allowlist, rate-limit,
  vérif JWT `auth.getUser`, montant calculé **côté serveur** jamais reçu du client).
- `escrow-webhook` : reprend le squelette de `stripe-webhook` (vérif signature, `service_role`,
  upsert/transition idempotent), étendu à la machine d'état escrow.
- `confirm-delivery` / `open-dispute` : écrivent une **intention** (confirmation, demande de
  litige) ; la transition d'état effective reste déclenchée/validée serveur pour ne jamais
  laisser le client forcer un `released`.

---

## 7. UI — suivi de transaction

Vue partagée acheteur / vendeur, centrée sur une **timeline d'événements** (lecture directe de
`escrow_events`, triés `created_at`). Objectif : rendre l'état des fonds **lisible et rassurant**
à tout instant.

```
┌─ Transaction escrow — Pelle Komatsu PC210  ·  85 000 € ──────────────┐
│  Statut : ● Fonds bloqués (funded)                                   │
│                                                                      │
│  ✓ Transaction ouverte               12/06  14:02                    │
│  ✓ Fonds bloqués chez le PSP         12/06  14:09   ← argent sécurisé│
│  ○ Inspection certifiée              en attente                      │
│  ○ Livraison confirmée               —                               │
│  ○ Fonds libérés au vendeur          —                               │
│                                                                      │
│  [ Suivre l'inspection ]   [ Ouvrir un litige ]                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Boutons conditionnels selon l'état** (le front lit `status`, mais ne l'écrit jamais) :

| État courant | Acheteur voit | Vendeur voit |
|--------------|---------------|--------------|
| `created` | « Financer la transaction » | « En attente de financement » |
| `funded` | « Suivre l'inspection » · « Ouvrir un litige » | « Fonds bloqués ✓ » · « Ouvrir un litige » |
| `inspection_passed` | « Confirmer la réception » · litige | « Confirmer l'expédition / la livraison » · litige |
| `delivered` | « En attente de libération » | « En attente de libération » |
| `released` | « Transaction clôturée ✓ » | « Fonds reçus ✓ » |
| `refunded` | « Remboursé ✓ » | « Transaction annulée » |
| `disputed` | « Litige en cours » | « Litige en cours » |

Aucun bouton ne déclenche une transition d'état directement : il appelle une Edge Function qui
enregistre une intention. La timeline est la **source de vérité visuelle**, alimentée par le
journal append-only.

---

## 8. KPIs

| KPI | Définition | Pourquoi c'est suivi |
|-----|------------|----------------------|
| **% transactions sous escrow** | escrow / (escrow + transactions hors escrow détectées) | mesure l'adoption et la rétention on-platform (anti-désintermédiation) |
| **Taux de litige** | `disputed` / `funded` | santé de la confiance ; un taux qui grimpe signale un problème d'inspection ou de vendeurs |
| **Délai de libération** | médiane `funded → released` | friction du workflow ; cible : minimiser sans sacrifier la vérification |
| **GMV sécurisé** | somme `amount` des transactions ayant atteint `funded` | volume de valeur effectivement protégée par le séquestre |
| **Taux de libération** | `released` / `funded` | inverse du frottement ; complète le taux de litige |
| **Délai d'inspection** | médiane `funded → inspection_passed` | identifie le goulot le plus fréquent du parcours |

> Tous calculables directement sur `escrow_transactions` + `escrow_events` (timestamps des
> transitions dans le journal append-only). Aucun pipeline analytique externe requis au MVP.

---

## 9. MVP vs roadmap

> Section anti-façade : ce qui est **réellement** livré au lancement vs. ce qui est annoncé
> comme cible. Au moment de la rédaction, **aucune ligne d'escrow n'est encore en production**
> (la migration et les fonctions ci-dessus sont à construire).

### MVP (premier corridor)
- **1 seul PSP** (probablement Stripe Connect pour la maturité de l'API *Connect* + webhooks
  signés), sur **1 seul corridor** géographique/devise.
- **Libération manuelle assistée** : un admin MineGrid valide la libération après contrôle des
  preuves (inspection + livraison). Le bouton « libérer » déclenche le `transfer` PSP côté
  serveur ; il n'est pas encore automatique. → maîtrise du risque opérationnel au démarrage.
- Inspection : rattachement d'un `inspection_report_id` produit par le module Inspection (même
  si l'inspection reste partiellement humaine au début).
- Litige : ouverture self-service, **résolution humaine** (admin) avec traçage `escrow_events`.

### Roadmap
- **Multi-PSP** : `flutterwave`, `peach` pour couvrir d'autres corridors / moyens de paiement
  locaux ; le champ `provider` est déjà prévu pour le routage.
- **Libération automatique sur preuves** : dès que `release_conditions` sont satisfaites par des
  preuves vérifiables (inspection certifiée + POD/CMR validé), le `transfer` se déclenche sans
  intervention humaine.
- **Assurance** : couverture optionnelle (transaction / transport) en partenariat assureur —
  toujours **porté par le partenaire**, jamais par le bilan MineGrid.
- Conditions de libération avancées (jalons partiels, libération échelonnée) via
  `release_conditions` enrichi.

---

## 10. Moat & lecture investisseur

### Le moat
1. **Confiance transactionnelle** : MineGrid devient l'endroit où une transaction d'engin à
   100 k€ entre deux pays peut se faire **sans se connaître ni se déplacer d'abord**. Ce niveau
   de confiance ne se copie pas par un concurrent « listing » : il exige le triptyque
   inspection certifiée + séquestre conditionné + journal opposable.
2. **Rétention on-platform (anti-désintermédiation)** : le recours n'existe que dans l'escrow.
   Sortir de la plateforme = perdre la protection. La rétention est **structurelle**, pas
   contractuelle — donc robuste.
3. **Effet de cliquet avec l'inspection** : escrow et inspection se renforcent (l'un finance la
   confiance, l'autre la certifie). Ensemble, ils forment le *trust layer* qui est l'espace
   défendable de MineGrid — pas le listing, que tout le monde peut faire.

### Modèle économique (et ce qu'il n'est PAS)
- **Take rate via service** : un *service fee* prélevé **sur transaction réussie**, encaissé par
  le PSP comme `application_fee` au moment de la libération.
- **Jamais via le float** : MineGrid ne détient pas les fonds, donc ne gagne rien sur la
  détention/le placement du séquestre. Pas de revenu d'intérêt sur cash client.
- **Jamais via du crédit porté** : pas d'avance de working capital, pas de financement de
  facture sur bilan propre. **C'est précisément la ligne qui a tué Kobo360 et Lori** — MineGrid
  ne la franchit pas.

### En une phrase pour l'investisseur
> MineGrid capture de la valeur en **orchestrant la confiance** (état + workflow + preuve),
> pas en **portant le risque**. Le séquestre, opéré par un PSP réglementé, rend la transaction
> transfrontalière d'engins lourds possible là où elle était bloquée — et la rend **collante**,
> parce que la protection disparaît hors plateforme.
