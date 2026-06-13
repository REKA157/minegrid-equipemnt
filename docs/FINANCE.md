# MineGrid Finance — Apporteur d'affaires de financement (zéro risque porté)

> **Règle d'or absolue.** MineGrid ne porte **jamais** de risque de crédit ni de float.
> MineGrid **qualifie et score** un dossier, puis le **transmet** à des banques/leasers
> partenaires qui décident et décaissent. Revenu = **commission d'apport** sur le
> financement effectivement décaissé. C'est la leçon de Kobo360 (effondré en payant les
> transporteurs upfront) et de Lori Systems (120 M$ → 5 M$ de valorisation pour la même
> raison de working capital) : en Afrique, **qui porte le float meurt**. Le modèle
> gagnant est l'orchestration + l'invoice finance porté par les banques (type Ecobank/Lori).

---

## 1. Problème & thèse

Le financement est la **friction décisive** de l'achat d'engins en Afrique :

- **Gap de trade finance africain : 100-120 Md$/an** (AfDB), projeté 86,6-102,6 Md$ en 2027.
- Refus bancaires motivés par la **solvabilité (48 % des banques)** et le **collatéral insuffisant (39 %)** — inchangés depuis 2014.
- Le marché du **financement d'équipement MEA ne pèse que 2,6 Md$** : sous-financement massif.
- Une PME BTP ivoirienne ou un sous-traitant minier guinéen ne peut pas obtenir de lettre de crédit pour importer une pelle à 120 k€.

**Thèse :** une marketplace qui **débloque le crédit** détient un avantage décisif sur le
listing pur. L'engin lui-même est le collatéral ; MineGrid apporte ce qui manque aux
banques : un **dossier qualifié**, une **valeur de marché fiable** (via la Data Platform)
et un **historique de confiance** (via le Trust Layer). MineGrid transforme un acheteur
« non bancable » en dossier finançable — sans jamais prêter son propre argent.

---

## 2. Modèle de données (`sql/nextgen/0002_escrow_and_finance.sql`)

### `finance_partners` — catalogue des financeurs
| Colonne | Type | Note |
|---|---|---|
| `id` | uuid | |
| `name`, `country` | text | banque / leaser / fintech |
| `products` | jsonb | `['leasing','credit_vendeur','invoice_finance']` |
| `min_amount`, `max_amount` | numeric | fourchette de tickets |
| `active` | bool | |

**RLS :** `SELECT` public (les offres sont un catalogue) ; écriture `service_role`.

### `finance_applications` — dossiers de financement
| Colonne | Type | Note |
|---|---|---|
| `id` | uuid | |
| `applicant_id` | uuid → auth.users | demandeur |
| `machine_id` | uuid | bien financé (collatéral) |
| `amount`, `currency`, `term_months` | numeric/text/int | `term` 1-120 |
| `status` | text | `draft/submitted/scoring/forwarded/approved/rejected/cancelled` |
| `score` | int 0-100 | **écrit par le serveur uniquement** |
| `partner_id` | uuid → finance_partners | partenaire retenu |
| `dossier` | jsonb | URLs **signées** des pièces (Kbis/RC, bilans, RIB) |

**RLS :** le demandeur `SELECT` + `INSERT`(status `draft`/`submitted`) + `UPDATE` tant que
`draft`/`submitted`. Le **scoring** et la **transmission** (`scoring/forwarded/approved/rejected`)
sont réservés au `service_role`. `DELETE` révoqué côté client. → Un demandeur ne peut pas
s'auto-attribuer un score ni un statut « approuvé ».

---

## 3. Modèle d'affaires (aucun float)

| Flux | Qui porte le risque | Revenu MineGrid |
|---|---|---|
| Apport de dossier qualifié | Banque/leaser partenaire | **Commission d'apport** (typiquement 1-3 % du montant décaissé) |
| Données de valorisation (LTV) | — | Inclus / data product (voir `DATA_PLATFORM.md`) |
| Assurance / garantie (roadmap) | Assureur partenaire | Commission d'apport |

**Jamais :** prêt sur fonds propres, avance, garantie de première perte, portage de
créance. Toute tentation de « porter pour accélérer » est rejetée par construction (la
table ne modélise aucun décaissement MineGrid ; les fonds ne transitent pas par MineGrid).

---

## 4. Moteur de scoring (`score-application`, serveur)

Objectif : produire un **score 0-100** + une **éligibilité partenaires**, traçé dans
`ai_predictions` (`model='finance_score_v1'`). Le calcul est **serveur uniquement**.

**Features (toutes déjà disponibles dans le socle) :**
| Feature | Source | Effet |
|---|---|---|
| `trust_score` du demandeur | `trust_profiles` | + (confiance vérifiée) |
| Vérifications KYB approuvées | `verifications` | + (identité, RC, fiscal, bancaire) |
| Historique transactions / litiges | `escrow_transactions`, `machine_history` | + / − |
| Ancienneté du compte | `auth.users` | + |
| **Loan-to-Value (LTV)** | `amount` ÷ estimation prix (`estimate_price` RPC, voir `DATA_PLATFORM.md`) | − si LTV élevé |
| Complétude du `dossier` | présence Kbis/RC, bilans, RIB | + |
| Cohérence montant ↔ machine | `amount` vs valeur estimée | flag fraude si aberrant |

**MVP (heuristique, implémentable maintenant) :** somme pondérée des features ci-dessus,
seuils par tranche de montant ; éligibilité = `finance_partners` dont `[min_amount,
max_amount]` contient le ticket et `products` couvre le besoin. **Roadmap (ML) :** modèle
de risque entraîné sur les issues réelles (accordé/refusé/défaut) une fois le volume
suffisant — entraîné sur la **data propriétaire**, pas un wrapper générique.

> Le score n'est PAS une décision de crédit (que MineGrid ne prend pas) : c'est un
> **pré-tri** qui maximise le taux de transformation côté partenaire et évite de leur
> envoyer du bruit.

---

## 5. Workflow bout-en-bout

```
[Brouillon]  demandeur remplit montant/durée + uploade pièces (Storage privé, URLs signées)
     │  INSERT finance_applications (status='draft')  — RLS demandeur
     ▼
[Soumis]     demandeur soumet            status='submitted'
     │  Edge Function score-application (service_role)
     ▼
[Scoring]    moteur calcule score + LTV  status='scoring' → score, ai_predictions
     │  matching finance_partners éligibles
     ▼
[Transmis]   forward-to-partner (API/email sécurisé)  status='forwarded', partner_id
     │  partner-callback (webhook signé partenaire)
     ▼
[Accordé] ou [Refusé]   status='approved' | 'rejected'
```

Toutes les transitions sensibles (scoring → approved) sont écrites par le `service_role`.
Le demandeur **suit** son statut mais ne peut pas le modifier au-delà de `submitted`.

---

## 6. APIs / Edge Functions

| Fonction | Acteur | Rôle |
|---|---|---|
| `submit-application` | client (JWT) | passe `draft`→`submitted`, valide les pièces |
| `score-application` | serveur (cron/déclenché) | calcule score + LTV, écrit `ai_predictions` |
| `forward-to-partner` | serveur | sélectionne partenaire, transmet le dossier (API/email signé) |
| `partner-callback` | serveur (webhook signé) | reçoit la décision, écrit `approved`/`rejected` |

Storage : bucket privé `finance-docs/{user_id}/…` ; accès uniquement via **URLs signées**
côté serveur (jamais public). Conforme au principe « écritures/secrets serveur ».

---

## 7. UI / écrans

1. **Simulateur de financement** (public, sur la fiche machine) : montant, apport, durée →
   mensualité indicative + bouton « Demander un financement ». Honnête : « estimation, sous
   réserve d'acceptation du partenaire ».
2. **Formulaire dossier** (connecté) : pièces (Kbis/RC, 2 bilans, RIB), enregistrement
   progressif (`draft`).
3. **Suivi de dossier** : timeline de statut (soumis → en analyse → transmis → décision),
   sans jargon technique.
4. **Catalogue partenaires** : offres `finance_partners` (produit, pays, fourchette).
5. **Back-office** : revue, transmission, réconciliation des commissions.

---

## 8. KPIs

| KPI | Cible indicative |
|---|---|
| Taux soumission → transmission | > 60 % (qualité du pré-tri) |
| Taux transmission → accord partenaire | > 30 % |
| Montant financé facilité (GMV crédit) | driver de GMV global |
| Délai soumission → décision | < 10 jours |
| Commission d'apport moyenne | 1-3 % du décaissé |
| Taux de défaut **chez les partenaires** | suivi (qualité du scoring), **sans impact bilan MineGrid** |

---

## 9. MVP vs roadmap (anti-façade)

| | MVP (maintenant) | Roadmap |
|---|---|---|
| Partenaires | 1-2 banques/leasers signés sur 1 corridor | réseau multi-pays |
| Scoring | heuristique pondérée + LTV via `estimate_price` | modèle ML sur issues réelles |
| Transmission | email/API sécurisé | intégration API partenaires, signature électronique |
| Pièces | upload + URLs signées | OCR/extraction, vérification automatique |
| Décaissement | côté partenaire (hors plateforme) | suivi de décaissement, assurance crédit |

> Tant qu'un partenaire réel n'est pas signé, le module affiche un état honnête
> (« financement bientôt disponible — laissez vos coordonnées ») — **jamais** un faux
> accord. (Règle anti-façade NextGen.)

---

## 10. Conformité

- **KYC/KYB** : identité (`verifications.identity`), entreprise (`company_registration`,
  `tax_id`), bancaire (`bank_account`) — réutilise le Trust Layer.
- **Cadre réglementaire** : MineGrid agit en **apporteur/intermédiaire**, pas en
  établissement de crédit ; cadrer le statut (IOBSP / partenariat bancaire) par pays.
  Pas de courtage non autorisé.
- **Données financières** : RGPD / loi 09-08 (CNDP), minimisation, conservation limitée,
  pièces en Storage privé chiffré, URLs signées à durée courte.

---

## 11. Moat & angle investisseur

- **Relation partenaires** (banques/leasers/assureurs) : difficile à répliquer, longue à nouer.
- **Dossiers scorés** + **LTV fiable** via la data prix propriétaire (`price_observations`) :
  MineGrid apporte aux banques ce qu'elles ne savent pas faire en Afrique (valoriser
  l'occasion + scorer la confiance).
- **Boucle composable** : Trust → Inspection (collatéral certifié) → Estimation (LTV) →
  Finance → Escrow (sécurise le décaissement) → Data (issues de crédit enrichissent le scoring).
- **Récit investisseur (fintech) :** MineGrid n'est pas un prêteur risqué de plus, c'est
  une **couche d'origination et de scoring** qui débloque un marché de 100+ Md$ de gap,
  **sans bilan ni risque de crédit** — exactement le profil capital-light que recherchent
  les fonds B2B/fintech.
