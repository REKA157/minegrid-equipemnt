# MINEGRID — FEUILLE DE ROUTE DE REMÉDIATION

**Date** : 2026-09-29 · 151 problèmes retenus · 13 P0 · 39 P1

Cette feuille de route est ordonnée par **rapport valeur/effort**, pas par sévérité. Certains P0
se ferment en dix minutes ; certains P1 demandent des semaines.

---

## Jalon 0 — Aujourd'hui (quelques heures)

Trois actions qui ferment quatre P0 sans écrire une ligne de code applicatif.

| # | Action | Ferme | Effort |
|---|---|---|---|
| 0.1 | **Couper ou protéger `renders-ai`** dans le tableau de bord Supabase | `AO-06` | 10 min |
| 0.2 | **Vérifier la consommation Anthropic**, révoquer la clé si anormale | `AO-06` | 20 min |
| 0.3 | **Téléverser `dist/` chez l'hébergeur**, puis `npm run verifier:deploiement` | `CART-01`, `RES-01`, `SCA-01` | 30 min |
| 0.4 | **Pousser le dépôt sur un remote** | `SAUV-01` | 10 min |

> ⚠️ 0.1 sans corriger `aiService.ts` bascule tous les clients payants en simulation (`M-04`).
> Si vous coupez, prévenez-les ou faites les deux dans la même journée.

---

## Jalon 1 — Cette semaine

### 1.1 Appliquer `p29` — trois P0 dans une migration déjà écrite et testée

`CTR-01` (le client écrit `total_amount`), `CTR-02` (suppression en cascade d'un dossier payé),
`CTR-03` (prédicat tautologique `p.case_id = p.case_id`), plus `CTR-04` (participant invité mais
jamais acceptant qui lit tout le dossier).

Staging d'abord, contre-cas rejoués, production ensuite. **Effort : une demi-journée**, l'essentiel
étant la vérification.

### 1.2 Redéployer les Edge Functions depuis le dépôt

En priorité `send-contact-email` (`CART-02`) puis `paddle-webhook` — sans lui, un paiement réussi
n'active aucun abonnement. Mode d'emploi : `docs/build/deployer-fonctions.md`. **1 journée.**

### 1.3 Traiter les 13 717 annonces à vendeur fictif

Le correctif de code est fait (cet audit) : le parcours de devis rejette désormais ces
identifiants. **Reste la décision produit** : ces annonces restent-elles visibles ? Si oui, elles
doivent porter une mention claire. **Décision + 1 journée.**

### 1.4 Restaurer une sauvegarde sur un projet de test

Pas « vérifier qu'une sauvegarde existe » : **la restaurer**. Tant que ce n'est pas fait, le RPO
et le RTO sont inconnus. **Une demi-journée.**

---

## Jalon 2 — Ce mois

| # | Action | Ferme | Effort |
|---|---|---|---|
| 2.1 | Appliquer `p27`, `p28`, `p29b`, `p30`, `p31`, `p32`, `p33` ; `npm run bases` sans écart | ~12 P1/P2 | 2 j |
| 2.2 | Brancher un collecteur d'erreurs de production | `OBS-01` | 0,5 j |
| 2.3 | Réparer le pipeline d'intégration continue (branches inexistantes, `\|\| true`) | `CI-02`, `CICD-05` | 1 j |
| 2.4 | Versionner la configuration de build (sans les secrets) | `CICD-04` | 0,5 j |
| 2.5 | Les 33 tables absentes : créer, ou désactiver les écrans qui en dépendent | `CART-03` | 2 j |
| 2.6 | Redimensionner les images du catalogue (215 ko par vignette) | `SCA-07` | 2 j |
| 2.7 | En-têtes de cache sur `index.html` | `HEB-03` | 1 h |
| 2.8 | Faire appliquer `baseline.sql` par le harnais de preuves | `SAUV-03` | 0,5 j |

---

## Jalon 3 — Le chantier de fond : le Tender Core

**C'est un développement, pas une remédiation.** Estimation : **4 à 8 semaines** selon
l'ambition, découpé en six étapes non cassantes détaillées dans `MINEGRID_RFQ_TENDER_AUDIT.md`.

Avant de l'engager, une question à trancher : **MineGrid a-t-il besoin d'un moteur d'appel
d'offres acheteur, ou d'une simple consultation multi-vendeurs ?** La différence est d'un facteur
cinq en effort. Une place de marché d'engins a rarement besoin de lots, d'addenda et d'incoterms ;
elle a besoin qu'un acheteur puisse demander un prix à cinq vendeurs et comparer les réponses.

**Ma recommandation** : commencer par la consultation multi-vendeurs (2 semaines), qui couvre le
besoin réel, et ne construire le Tender Core complet que si un client le demande.

---

## Ce qui a été corrigé pendant cet audit

Tout est sur la branche `audit/production-2026-09-29`, aucune modification en production.

| Correctif | Problème | Test de non-régression |
|---|---|---|
| Filtre du vendeur fictif dans le parcours de devis (`quoteRequests.ts`) | `SEQ-05`, `CTR-05` | `quoteRequests.vendeurFictif.test.ts` — 9 cas, vérifiés par mutation |
| Garde-fou `npm run verifier:deploiement` | `CART-01` | Le script sort en code 1 aujourd'hui : il détecte le retard |

**Pourquoi si peu de correctifs ?** Parce que la majorité des P0 ne se corrigent pas dans le
dépôt : ils se corrigent en **déployant** ce qui y est déjà, ou en **appliquant** des migrations
déjà écrites. Écrire du code neuf par-dessus aurait aggravé l'écart entre le dépôt et la
production, qui est précisément le problème central.

---

## Ce que je n'ai pas fait, et pourquoi

- **Aucune écriture en production**, ni base, ni fonction, ni hébergement. C'était la consigne, et
  c'est aussi la seule façon d'auditer sans fausser ce qu'on mesure.
- **Aucun test de montée en charge** contre la production : ce serait une écriture et un risque
  pour un service en exploitation.
- **Aucun envoi de courriel de test** : c'est pourquoi « `send-contact-email` n'envoie rien » est
  classé **TRÈS PROBABLE** et non **PROUVÉ**.
- **Aucun appel coûteux à `renders-ai`** : seule l'action `ping` a été utilisée, qui n'appelle
  aucun modèle. L'exposition est prouvée, aucune dépense n'a été engagée.
