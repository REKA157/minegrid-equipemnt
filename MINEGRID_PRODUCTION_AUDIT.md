# MINEGRID — AUDIT DE PRODUCTION

**Date** : 2026-09-29 · **Dépôt** : `SITE_MINEGRID_EQUIPEMENT_cover 1`, 406 commits, HEAD `821b64fb`
**Branche d'audit** : `audit/production-2026-09-29` · **Point de retour** : étiquette `audit-2026-09-29-depart`
**Base auditée** : production Supabase `tnfbggrftmtxpgbcwqzo` — **en lecture seule, aucune écriture**

---

# VERDICT : **NO-GO**

MineGrid ne peut pas être ouvert commercialement en l'état. Ce n'est pas un jugement de qualité
du code — le socle est meilleur que ce que la note globale laisse croire — mais le constat de
trois faits vérifiés qui rendent la mise en service impossible aujourd'hui.

## Les trois raisons, chacune vérifiée personnellement

### 1. Le site en ligne n'exécute pas le code de ce dépôt

```
site en ligne : assets/index-Dww9BKdi.js
dépôt (HEAD)  : assets/index-Bzddij97.js
chaîne « catalogue_facettes »   → en ligne : 0   local : 1
chaîne « machines_catalogue »   → en ligne : 0   local : 1
```

Le paquet servi par `minegrid-equipement.com` date du **15 août 2026**. Six semaines de
correctifs — sécurité comprise — ne sont pas en production.

**Conséquence directe** : tout ce qui suit dans cet audit décrit le DÉPÔT. L'état réel de la
production est celui d'une version antérieure, moins bonne. Aucune conclusion rassurante tirée du
code ne vaut pour vos utilisateurs tant que ce déploiement n'a pas eu lieu.

### 2. Une fonction serveur dépense votre argent, accessible avec une clé publique

```
POST .../functions/v1/renders-ai   {"action":"ping"}
   avec la clé anon (publique, lisible dans le JavaScript du site)
   → HTTP 200   {"ok":true,"model":"claude-opus-4-8","hasKey":true}
```

`renders-ai` est déployée sous un nom **qui n'existe pas dans le dépôt** (déploiement manuel
historique). Elle détient votre clé Anthropic et répond à quiconque présente la clé publique du
site — c'est-à-dire n'importe qui.

Je me suis limité à l'action `ping`, qui n'appelle aucun modèle : **aucune dépense n'a été
engagée par cet audit**. Mais l'exposition est prouvée.

**À faire aujourd'hui, avant tout le reste** : voir la section « Action immédiate » ci-dessous.

### 3. Le moteur d'appel d'offres ne fait pas ce que le cahier des charges décrit

Le module `src/tenders` (11 397 lignes, 38 fichiers) sert à **répondre** à un appel d'offres
public, pas à en **lancer** un. Preuve : `TenderNew.tsx:148` demande « Acheteur / maître
d'ouvrage — Ex. : Commune de Bouskoura ». Les onglets sont : analyse du DCE, exigences, go/no-go,
stratégie, mémoire technique.

Aucune notion de `Bid`, `Offer`, `supplier` ou invitation dans `src/tenders/types.ts` — grep à
vide. Les données vivent dans le navigateur (`zustand/persist`, clé `minegrid-tenders-store`).

**Ce n'est pas un défaut à corriger : c'est un module qui résout le problème inverse.** Le moteur
décrit dans le cahier des charges (lots, invitations, offres scellées, notation, attribution) est
un développement à faire, pas une réparation. Voir `MINEGRID_RFQ_TENDER_AUDIT.md`.

---

## Action immédiate — aujourd'hui

1. **Couper ou protéger `renders-ai`.** Dans le tableau de bord Supabase → Edge Functions →
   `renders-ai` → supprimer, ou redéployer `tenders-ai` depuis le dépôt (`REQUIRE_AUTH` y vaut
   vrai par défaut) et faire pointer `VITE_TENDERS_AI_FUNCTION` dessus.
   ⚠️ **Piège identifié** : le client n'envoie jamais le jeton de session à cette fonction
   (`src/tenders/ai/aiService.ts:82-88` envoie la clé anon). Fermer la porte sans corriger le
   client mettrait **tous** vos clients payants en « mode simulation ». Les deux vont ensemble.
2. **Vérifier votre consommation Anthropic** des dernières semaines. Si elle est anormale, la
   clé a probablement été utilisée par des tiers : révoquez-la et remplacez-la.

> 🔒 Ne collez aucune clé dans une conversation : elles s'écrivent en clair sur le disque. Elles
> se posent dans le tableau de bord Supabase ou dans un `.env` local.

---

## Comment cet audit a été conduit

Huit dimensions instruites en parallèle (cartographie, base de données, RLS, appel d'offres,
chaîne transactionnelle, sécurité offensive, scalabilité, exploitation), **chacune reprise ensuite
par un second auditeur chargé de la contredire** — de démonter les preuves faibles autant que de
trouver ce que le premier avait manqué.

- **151 problèmes retenus** : 13 P0, 39 P1, 60 P2, 32 P3, 2 P4
- **10 problèmes écartés** par le contre-audit après re-vérification
- Les constats les plus lourds ont été **re-vérifiés personnellement**, commande par commande

Niveaux de preuve employés, et rien d'autre : **PROUVÉ**, **TRÈS PROBABLE**, **NON VÉRIFIÉ**,
**FAUX**.

### Un P0 rejeté après vérification

`AO-06` annonçait un proxy IA « ouvert à tout Internet **sans authentification** ». Vérifié : sans
aucune clé, la fonction renvoie **401**. L'énoncé était donc faux sur ce point précis. En
revanche, l'exposition via la **clé publique** est réelle — le problème est conservé avec sa
formulation corrigée. C'est exactement ce que la contre-vérification sert à produire : ni
alarmisme, ni complaisance.

---

## Ce qui, au contraire, tient bien

Ces points ont été **vérifiés**, pas supposés :

| Sujet | Constat |
|---|---|
| **Secrets dans le paquet livré** | ✅ Aucun. Les 8 motifs testés (`service_role`, `sbp_`, `sk_live`, clés Anthropic/Paddle/Resend) renvoient zéro. La clé anon présente est publique par construction. |
| **RLS sur les tables sensibles** | ✅ `pro_clients`, `organizations`, `transaction_cases`, `quote_requests`, `leads` renvoient une liste vide en anonyme ; `platform_admins` et `promo_codes` renvoient 401. |
| **Base reconstructible depuis git** | ✅ **OUI** — 57 migrations sur 58 rejouées avec succès sur PostgreSQL 16 vierge. L'unique échec vient du bouchon de test, pas du projet. |
| **Performance de la base** | ✅ 0,23 s sur la 1ʳᵉ ligne, 0,27 s sur la 16 000ᵉ. Plate. Elle tiendrait 100 000 annonces. |
| **En-têtes de sécurité de l'hébergement** | ✅ HTTPS, HSTS, X-Content-Type-Options, Referrer-Policy présents. |
| **Tests** | ✅ 634 tests verts, build OK, types OK (`strictNullChecks` activé cette semaine). |

**Le socle technique n'est pas le problème.** Le problème est l'écart entre ce dépôt et ce qui
tourne réellement, et une chaîne transactionnelle dont plusieurs maillons sont des écrans sans
base derrière.

---

## Verdicts par dimension

| Dimension | Verdict |
|---|---|
| Cartographie du système réel | **NO-GO** |
| Migrations et PostgreSQL | CONDITIONAL GO |
| RLS et RBAC | CONDITIONAL GO |
| **Moteur d'appel d'offres** | **NO-GO** |
| Chaîne transactionnelle | **NO-GO** |
| Sécurité offensive | CONDITIONAL GO |
| Scalabilité | CONDITIONAL GO |
| Exploitation, sauvegardes, CI/CD | **NO-GO** |

---

## Les 13 P0

Chacun est détaillé dans le document thématique correspondant.

| ID | Problème | Où |
|---|---|---|
| `CART-01` | Le site en ligne n'est pas le code du dépôt | ce document |
| `CART-02` | `send-contact-email` déployée accepte tout et répond « ok » | ce document |
| `AO-06` | `renders-ai` dépense votre clé Anthropic avec la clé publique | `SECURITY` |
| `M-01` | Poste partagé : le classeur d'AO du collègue reste lisible après déconnexion | `RFQ_TENDER` |
| `M-02` | Appliquer les migrations « prêtes » viderait l'espace de travail AO | `RFQ_TENDER` |
| `SEQ-01` | Prix stocké en **texte sans devise**, converti en MAD par défaut | `DATABASE` |
| `SEQ-04` | Le séquestre n'existe pas : aucun prestataire, fonctions absentes | `PRODUCTION` |
| `SEQ-05` | 83,7 % des annonces portent un vendeur fictif ; le filtre n'est pas dans le parcours devis | ce document |
| `CTR-01` | Le client écrit lui-même `total_amount`, `currency` et `status` du dossier | `SECURITY` |
| `CTR-02` | Un vendeur peut **supprimer** un dossier payé → cascade destructrice | `SECURITY` |
| `CTR-03` | Prédicat tautologique : un courtier devient partie de **n'importe quel** dossier | `SECURITY` |
| `SAUV-01` | 167 versions du code n'existent que sur cette machine | `PRODUCTION` |
| `CICD-04` | La configuration de build de production n'est dans aucun dépôt | `PRODUCTION` |

---

## `SEQ-05` — 83,7 % du catalogue n'a pas de vendeur réel

Mesuré directement :

```
total des annonces                          16 397
vendeur fictif 00000000-…-000000000001      13 717   (83,7 %)
vendeur réel                                 2 680
```

Le dépôt contient bien un filtre de ce vendeur fantôme (`machineDetailHelpers.ts:44-61`), mais
**le parcours de demande de devis ne l'utilise pas** : `quoteRequests.ts` ne valide que le format
de l'identifiant. Une demande adressée à une de ces 13 717 annonces part donc vers un vendeur qui
n'existe pas.

C'est aussi ce qui fausse toute lecture commerciale du catalogue : il ressemble à 16 000 machines
en vente, il en compte 2 680.

---

## `CART-02` — le formulaire de contact annonce un envoi non confirmé

```
POST .../functions/v1/send-contact-email   {}
   → HTTP 200   {"ok":true,"received":null}
```

Le code du dépôt renverrait **400 « Données manquantes »** (`index.ts:443-445`). La fonction
déployée est donc une version antérieure et permissive.

**Nuance d'honnêteté** : ce qui est **PROUVÉ**, c'est que la fonction déployée n'est pas celle du
dépôt et qu'elle répond « ok » à une entrée que le dépôt rejetterait. Qu'elle n'envoie
strictement rien est **TRÈS PROBABLE** mais non prouvé — le vérifier exigerait d'envoyer un vrai
courriel, ce que je me suis interdit.

La demande est bien écrite dans `quote_requests` (table présente). Le risque est donc : le lead
existe en base, mais personne n'est prévenu.

---

## Documents de cet audit

| Fichier | Contenu |
|---|---|
| `MINEGRID_PRODUCTION_AUDIT.md` | ce document — verdict et synthèse |
| `MINEGRID_RFQ_TENDER_AUDIT.md` | appel d'offres : existant, écart, proposition de Tender Core |
| `MINEGRID_SECURITY_AUDIT.md` | sécurité offensive, RLS, matrice des droits |
| `MINEGRID_SCALABILITY_AUDIT.md` | mesures x1/x10/x100/x1000, points de rupture |
| `MINEGRID_DATABASE_AUDIT.md` | migrations, intégrité, reconstructibilité |
| `MINEGRID_TEST_REPORT.md` | couverture réelle, tests ajoutés, ce qui reste sans filet |
| `MINEGRID_RELEASE_CHECKLIST.md` | ce qui doit être vrai avant d'ouvrir |
| `MINEGRID_REMEDIATION_ROADMAP.md` | ordre de traitement, effort, dépendances |
