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
| 0.3 | ~~**Rendre le téléversement SÛR**~~ ✅ **FAIT** — voir l'encadré ci-dessous | nouveau P0 | fait |
| 0.4 | **Téléverser `dist/`**, puis `npm run verifier:deploiement` | `CART-01`, `RES-01`, `SCA-01` | 30 min |
| 0.5 | **Pousser les 329–373 commits** sur les remotes existants | `SAUV-01` | 10 min |

> ⚠️ 0.1 sans corriger `aiService.ts` bascule tous les clients payants en simulation (`M-04`).
> Si vous coupez, prévenez-les ou faites les deux dans la même journée.

### 🔴 CORRECTION — le téléversement n'est PAS sans risque en l'état

La première version de cette feuille de route annonçait « téléverser `dist/` — 30 min, sans
risque ». **C'était faux**, et c'est la contre-analyse qui l'a établi. Vérifié :

```
$ cat dist/assets/InternalGate-VFpDfocY.js
  function r(){return!0}      ← la garde de l'espace interne vaut TOUJOURS vrai
```

Cause : `.env:16 VITE_ENABLE_NEXTGEN=true`, chargé par Vite dans **tous** les modes. Téléverser
le paquet actuel **publierait l'espace interne `#nextgen`** (acheter, vendre, trust, inspection,
escrow, finance, logistique) — des écrans sans base derrière.

Second piège, même origine : `.env.production:32 VITE_TENDERS_SHARED=true` alors que la RPC
`get_my_tender_workspace` n'existe pas en base. Le module Appels d'offres afficherait un bandeau
rouge permanent chez tous les clients.

**✅ FAIT le 2026-09-29.** Les deux variables sont neutralisées, le paquet est reconstruit, et
la garde compile désormais en `return!1` :

```
$ cat dist/assets/InternalGate-*.js
  function x(){return!1}        ← fermée ; le composant rend la page restreinte
$ grep -c get_my_tender_workspace dist/assets/*.js
  aucune occurrence             ← la RPC absente n'est plus appelée
```

Sauvegardes conservées : `.env.avant-audit-2026-09-29`, `.env.production.avant-audit-2026-09-29`.

**Et surtout, cela ne peut plus se reproduire en silence** : `scripts/verifier-bundle.mjs` refuse
désormais un paquet dont la garde vaut « toujours vrai », et il s'exécute automatiquement après
chaque `npm run build`. Vérifié par mutation — reconstruire avec `VITE_ENABLE_NEXTGEN=true` fait
**échouer le build** :

```
1. ESPACE INTERNE #nextgen OUVERT AU PUBLIC dans ce paquet.
   La garde se compile en « toujours vrai ». Televerser publierait les ecrans
   acheter, vendre, trust, inspection, escrow, finance et logistique.
```

**Il reste donc à téléverser `dist/`**, puis `npm run verifier:deploiement`.

### 🔴 La question à poser AVANT tout le reste

99,25 % du catalogue est importé, et les photos sont servies depuis les serveurs de tiers :
197 images sur 200 échantillonnées viennent du CDN de **Ritchie Bros / IronPlanet**, 27 de
**leboncoin**. Sous un vendeur fantôme, sans attribution visible.

**Existe-t-il un accord avec ces sources ?** Si oui, documentez-le. Sinon, c'est une exposition
qu'aucune correction de code ne réduit — et elle prime sur les treize P0 techniques.

Dépendance d'exploitation associée : le jour où ce CDN bloque les liens externes, **83 % de vos
vignettes disparaissent** sans qu'une ligne de votre code ne change.

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
| Garde-fou `npm run verifier:deploiement` | `CART-01` | `verifierDeploiement.test.ts` — 8 cas, vérifiés par mutation. Le script sort en code 1 aujourd'hui : il détecte le retard |
| **Espace interne refermé** (`.env`, `.env.production`) + **le build refuse un paquet ouvert** | nouveau P0 de la contre-analyse | Vérifié par mutation : reconstruire avec `VITE_ENABLE_NEXTGEN=true` fait échouer le build |
| **Plus de faux succès sur le formulaire de contact** (`MachineDetail.tsx`) : l'envoi n'est annoncé que si la fonction confirme un destinataire | `CART-02` | — (le chemin exige un envoi réel ; non testé volontairement) |

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
