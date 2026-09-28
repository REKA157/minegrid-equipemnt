# ETAT — MineGrid Équipement

> Tableau de bord du projet. **À lire en début de session, à mettre à jour avant chaque commit.**
> Dernière mise à jour : **2026-09-28**

---

## 🔎 État réel des deux bases — `npm run bases`

Un comparateur interroge prod et staging et liste les écarts en trente secondes,
sans aucun secret (clé publique lue dans le paquet construit).

**Relevé du 2026-09-28 :**

| | Objets |
|---|---|
| ⚠ **Écart prod ↔ staging** (2) | `tender_workspaces`, `get_my_tender_workspace` — **manquent en PRODUCTION** (migration teamE). Le module Appels d'offres y reste en mode local. |
| ✗ **Absents des DEUX bases** (8) | `subscription_payments` + les 7 fonctions d'administration — `p27`/`p28`/`p29` écrites et prouvées, **jamais appliquées** |
| ✅ Alignés | les 22 autres, dont `get_effective_subscription_for` (appliquée en prod depuis) |

**Pourquoi cet outil existe** : le 2026-08-18, **cinq pannes** ont eu la même cause — un objet présent
d'un côté, absent de l'autre, sans rien pour le signaler. Le symptôme ne désignait jamais la cause
(« radar injoignable » = fonction d'abonnement manquante ; « code promo invalide » = index manquant).
Chaque migration livrée doit désormais ajouter sa ligne dans `scripts/comparer-bases.mjs`.

⚠️ Le comparateur distingue **trois** états, pas deux : aligné, en écart, et **absent partout**.
Une première version ne signalait que les écarts — et déclarait donc « tout va bien » sur deux bases
également incomplètes, ce qui masquait `p27`/`p28`/`p29`.

---

## 🧹 Hygiène et scalabilité du dépôt — chantier en cours

Question posée le 2026-09-28 : *le dossier est-il propre et scalable, et les fichiers ne
sont-ils pas trop gros (600 lignes max) ?* Réponse mesurée, pas estimée.

**Ce qui est sain** : le socle (services, hooks, utilitaires, tests) est correctement
découpé. 463 tests verts. Le build passe. Rien n'est cassé.

**Ce qui ne l'est pas** : `src/pages` pèse **44 407 lignes sur 139 fichiers**, dont
**11 fichiers de plus de 1 000 lignes** et **20 de plus de 600**. Et quatre dossiers de
widgets parallèles font le même travail. Ce n'est pas un problème de performance — c'est
un problème de vitesse de modification : un fichier de 2 000 lignes se relit mal, se teste
mal, et deux personnes ne peuvent pas y travailler en même temps.

| Priorité | Ce que c'est | État |
|---|---|---|
| **1 — Registre des bases** | `npm run bases` : comparer prod et staging en 30 s | ✅ **fait** — 2 écarts et 8 manquants révélés dès le premier passage |
| **2 — Un seul endroit pour le SQL** | Le SQL vivait dans **quatre** dossiers, dont « SQL_A_APPLIQUER » qui était déjà appliqué | ✅ **fait** — 56 fichiers archivés, garde-fou `npm run verifier:sql` |
| **3 — Découper les gros fichiers** | 14 fichiers > 1 000 lignes (et non 11 : le chiffre a grossi avec le travail non commité) | 🔄 **en cours** — le plus gros est fait, voir ci-dessous |
| **4 — Les dossiers de widgets en double** | Il n'y avait pas à fusionner : un des forks était **mort** | ✅ **fait** — 33 fichiers / 8 779 lignes archivés |

### Priorité 2 — ce qui a été vérifié AVANT de déplacer quoi que ce soit

Déplacer du SQL sans vérifier ce qu'il contient, c'est risquer d'archiver une migration
jamais appliquée. Contrôles faits :

- `SQL_A_APPLIQUER/` (12 fichiers) : **déjà appliqué en production** — `escrow_transactions`,
  `escrow_events`, `price_observations`, `transaction_cases`, `transaction_participants`
  répondent toutes. Le nom du dossier mentait depuis des mois.
- `sql/` (44 fichiers) : repris dans la baseline (7 670 lignes, 67 tables, 219 policies).
  **Exception signalée** : `sql/nextgen/*` crée `finance_applications` et `finance_partners`,
  qui n'existent **ni en prod ni dans la baseline** — jamais appliqués, et pas applicables en l'état.
- Aucun code exécutable ne référençait ces chemins.

**Deux corrections à ma propre règle**, après l'avoir exécutée :
- `services/monitor-service/` a **sa propre base** : forcer ses migrations dans celles de la
  plateforme casserait le radar. Ma première version du garde-fou les signalait à tort.
- `AUDIT_CONTROL/` (83 sondes) n'est pas suivi par git et sert aux rapports d'audit : ce sont
  des instruments de mesure, pas du schéma. Le seul vrai intrus était
  `PREUVE-RLS-01-transaction_participants.sql`, resté à la racine — rangé dans `AUDIT_CONTROL/`,
  renvois mis à jour.

Garde-fou testé dans les deux sens : code 0 sur un dépôt rangé, code 1 sur un intrus posé exprès.

### Trouvé au passage : deux migrations au MÊME numéro de version — corrigé

`20260814140000_p29_subscription_payments.sql` et `20260814140000_p30_decisions_remediation.sql`
partageaient le préfixe `20260814140000`. Or la CLI Supabase s'en sert de **clé primaire** dans
`supabase_migrations.schema_migrations` : selon sa version, elle rejette en doublon **ou applique
un seul des deux fichiers, silencieusement**. Exactement le genre de panne qui ne se voit qu'une
fois en production.

Corrigé par `git mv` vers `20260814130000_p29b_subscription_payments.sql` — le registre des
paiements se place ainsi après `p29` (`…120000`) et avant `p30` (`…140000`), l'ordre logique.
Les renvois ont suivi, dont **`supabase/tests/run_all_proofs.sh` ligne 39** : le manifeste des
preuves aurait cherché un fichier disparu. Vérifié : plus aucun préfixe en double.

Ni l'une ni l'autre n'est appliquée nulle part (`npm run bases` le confirme : `subscription_payments`
absente des deux bases) — le renommage n'a donc aucune conséquence sur les bases existantes.

### Priorité 3 — `WidgetRenderer.tsx` : 3 563 → 1 497 lignes

C'était le plus gros fichier du dépôt. Le problème n'était pas seulement sa longueur :

| | Avant | Après |
|---|---|---|
| Lignes | 3 563 | **1 497** (−58 %) |
| `useState` | 84 | **32** |
| `useEffect` | 38 | **15** |
| Effets ouverts par `if (widget.id !== …) return` | 36 | **13** |

Le fichier déclarait l'état de **tous** les widgets à la fois. Afficher un seul widget allouait
les 84 états et déclenchait les 38 effets, dont 36 repartaient immédiatement. Sur un tableau de
douze widgets, cela se multipliait par douze. Ce n'était donc pas qu'une question de lisibilité.

**24 widgets** sont désormais des composants autonomes dans `src/components/dashboard/widgets/`,
chacun avec son état, son chargement et son abonnement à `pipeline:refresh`.

**Comment, sans casser** — le fichier n'avait aucun test, et 2 000 lignes de JSX déplacées à la
main se seraient abîmées sans que rien ne le signale :

- extraction **par programme** (jamais retapée), avec un script qui **refuse** dès qu'il rencontre
  un cas qu'il ne sait pas traiter : état partagé avec un autre widget, dépendance à une variable
  locale du parent, bloc mal borné. Il a refusé 9 widgets — ils restent à faire à la main ;
- `tsc` après **chaque** extraction, avec annulation automatique en cas d'échec. Il a servi :
  `demurrage-tracking` a cassé le fichier et a été annulé, le temps de corriger le script ;
- deux défauts du script attrapés par ces garde-fous : une découpe qui ne prenait que la première
  ligne d'une déclaration d'état sur plusieurs lignes, et un repère ambigu qui confondait la
  branche de rafraîchissement avec le bloc de rendu (même indentation).

**Ce qui est prouvé** : `widgetsExtraits.smoke.test.tsx` monte les 24 widgets, les laisse charger
sur une API vide, les démonte, et vérifie qu'ils **se désabonnent** de `pipeline:refresh`. Sans
cela, chaque ouverture du tableau de bord laisserait un écouteur derrière elle. Test vérifié par
mutation : supprimer un désabonnement le fait échouer.
Plus `widgetRendererMappers.test.ts` : 28 tests sur sept fonctions pures qui n'en avaient aucun.

**Total : 463 → 538 tests.** Types OK, build OK.

⚠️ **Honnêteté sur le gain** : le paquet livré ne rétrécit pas (596 → 598 ko). Les widgets restent
importés statiquement dans le même morceau. Le gain est sur les hooks, la taille des fichiers et
la testabilité — pas sur le poids téléchargé. Les charger à la demande serait une étape de plus.

**Reste sur ce fichier** : 9 widgets refusés par le script (dont `active-deliveries`,
`driver-schedule`, `route-optimization`, `repair-status`, `document-status`, `inventory-alerts`,
`rental-revenue`), qui partagent `handleWidgetAction` ou une donnée du parent.

### Priorité 4 — il n'y avait rien à fusionner : un fork était mort

Le diagnostic de départ (« quatre dossiers de widgets parallèles à fusionner ») était le bon
constat mais la mauvaise conclusion. `src/pages/enterprise/widgets/` contenait cinq fichiers
portant **exactement le même nom** que leur jumeau de `src/components/dashboard/widgets/` —
`ChartWidget`, `ListWidget`, `MetricWidget`, `SalesPipelineWidget`, `EquipmentAvailabilityWidget` —
avec des tailles différentes. Pas des copies : des **versions divergentes**.

Sauf qu'aucune des deux n'était en concurrence : **la racine de ce sous-arbre,
`WidgetComponent.tsx` (462 lignes), n'a aucun importateur.** Les 33 fichiers qui en dépendent
sont inatteignables depuis `main.tsx`.

**33 fichiers / 8 779 lignes** déplacés dans `archive/code-mort/` — dont
`SalesEvolutionWidgetEnriched.tsx` (1 723) et `SalesPipelineWidget.tsx` (1 354), **deux des
quatorze fichiers de plus de 1 000 lignes de la priorité 3**, réglés sans refactor.

Vérifié trois fois, parce que supprimer du code sur une analyse fausse est le pire des deux mondes :
graphe d'imports résolu, **un audit d'août 2026 qui avait conclu la même chose**, puis `tsc` +
538 tests + build après déplacement. Angles morts écartés : pas de `import.meta.glob`, pas
d'import dynamique construit, pas d'alias de chemin, aucune référence depuis un test.

⚠️ **Deux erreurs en chemin, corrigées** :
- Un premier relevé annonçait 92 fichiers / 20 178 lignes mortes. Il ne reconnaissait que les
  imports en guillemets **simples**, et condamnait donc à tort tout `src/pages/pro/widgets/`
  (5 534 lignes), importé en guillemets doubles par `ProDashboard.tsx`. C'est le **désaccord avec
  l'audit d'août** qui a révélé la faute. Chiffre exact : **83 fichiers, 14 644 lignes**.
- Le dossier comptait 34 fichiers, dont 33 morts. Le déplacer en bloc a emporté
  `InventoryStatusWidget.tsx`, bien utilisé lui. `tsc` l'a signalé sur-le-champ ; remis en place.

**Reste** : ~50 fichiers / ~5 900 lignes mortes dispersées (`QuoteGenerator.tsx`,
`ConfigurationPro.tsx`, doublons `dashboard/TopBar` vs `dashboard/layout/TopBar`…). Non traitées
volontairement : ce sont des pages isolées dont certaines peuvent attendre un rebranchement.
À trancher une par une.

### Trouvé au passage : le `tsconfig` strict n'est jamais utilisé

`tsconfig.app.json` déclare `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`.
Mais `npm run build` lance `tsc` tout court, qui lit `tsconfig.json` — où tout cela vaut **false**,
`noImplicitAny` compris. Aucun script ne référence `tsconfig.app.json`, et `tsconfig.json` ne le
déclare pas en `references` : **la configuration stricte est morte**. Le contrôle de types du build
est donc bien plus laxiste qu'il n'en a l'air. Non corrigé ici : activer `strict` sur 580 fichiers
est un chantier à part entière, à chiffrer avant de s'y mettre.

---

## Où on en est

Le **socle technique est sain** (sécurité auditée, abonnements prouvés de bout en bout, catalogue,
appels d'offres, radar). Ce qui manque est **opérationnel** : le site en ligne est cassé, on ne peut
pas encore encaisser, et il n'existe aucun outil d'administration.

### Verdict production — deux questions distinctes

| Question | Réponse |
|---|---|
| **Peut-on téléverser le paquet maintenant ?** | ✅ **OUI** — mais **après avoir appliqué la migration `p25`** (B4). Le site en ligne est cassé (base morte) : le nouveau paquet ne peut que l'améliorer. Roue de secours : garder l'ancien contenu dans `ancien/`. |
| **Peut-on ouvrir commercialement (encaisser) ?** | ❌ **PAS ENCORE** — B2 (Paddle live) et B3 (console d'administration). |

> **Pourquoi cet ordre.** Le paquet en ligne aujourd'hui pointe une base supprimée : la clé publique
> de la vraie base n'est donc **exposée nulle part**, et le défaut C1 ci-dessous n'est pas
> exploitable. Le téléverser publie cette clé (c'est normal et prévu) — et rend C1 exploitable dans
> la foulée. **La migration `p25` d'abord, le téléversement ensuite** : 2 minutes d'écart, pas un jour.

**Vérification du paquet le 2026-08-12** — le ZIP prêt à téléverser datait du 6 août (obsolète) :
**reconstruit à neuf** et re-vérifié.
- Types : OK · Tests : **381/381** · Build : OK (102 fichiers, 5,1 Mo)
- 8 contrôles de contenu OK : bonne base `tnfbgg…`, base morte `gvbtyd…` **absente**, base staging
  absente, radar HTTPS de prod, fonction IA `tenders-ai`, aucun jeton admin, aucune clé Paddle bac
  à sable, aucune adresse localhost (hors constante inoffensive de la librairie d'auth).
- Essai réel du paquet construit (`vite preview`, port 4188) : **400 annonces affichées**, base de
  prod joignable, radar de prod joignable, **zéro erreur console**.

⚠️ **Ordre imposé** : `.env.production` pointe la fonction IA `tenders-ai`, **pas encore déployée**.
Tant qu'elle ne l'est pas, les appels d'offres affichent honnêtement « mode simulation » (l'ancienne
fonction `renders-ai` est de toute façon en panne : erreur 500 par manque de streaming).
→ **Déployer `tenders-ai` juste après la mise en ligne.**

---

## 🚨 Bloqués sur (action requise, hors de portée de l'assistant)

| # | Bloquant | Qui | Détail |
|---|---|---|---|
| B1 | **Site en ligne cassé** : le bundle déployé appelle une base Supabase **supprimée** (`gvbtydxkvuwrxawkxiyv`) → aucune connexion possible pour personne | Patron | Correctif prêt : `minegrid-site.zip` **reconstruit le 2026-08-12**, vérifié 8 points + essai réel → à téléverser dans `public_html` (Hostinger) |
| B2 | **Aucun encaissement possible** : Paddle n'existe qu'en bac à sable | Patron | Ouvrir un compte **Paddle live** (vérification société, registre de commerce). Délai externe : plusieurs jours |
| B3 | **Console d'administration** — 🟢 **construite, en cours de déploiement** | Patron (SQL) | Voir la section dédiée ci-dessous |
| ~~B4~~ | ~~Migration `p25`~~ — ✅ **APPLIQUÉE le 2026-08-13 sur prod ET staging** | — | Vérifié depuis l'extérieur : `ensure_my_organization` (refuse un anonyme), `org_seat_limit` (=1 par défaut) et `org_seats_used` répondent sur les deux bases. La suppression de la règle et les révocations étant en tête du script, leur exécution est acquise |

### 🛠️ Console d'administration (B3) — construite les 13 et 14 août

Adresse `#admin`, cinq onglets. **Chargement paresseux** : 6 ko à part, aucun poids pour les visiteurs.

| Étape | Contenu | Preuves | Appliquée ? |
|---|---|---|---|
| **p26** | Compte administrateur réel : table, `is_platform_admin()`, journal infalsifiable, nomination/révocation | 12 contre-cas | ✅ prod **et** staging |
| **p27** | Écran Abonnés + 4 gestes (prolonger, palier, suspendre, réactiver) | 13 contre-cas | ❌ **ni prod ni staging** |
| **p28** | Boîte Contact + codes promo | 9 contre-cas | ❌ **ni prod ni staging** |

**Ce que la base garantit** (chaque ligne a son contre-cas) : la liste des administrateurs est
invisible aux clients, même en lecture · une révocation coupe l'accès immédiatement · le journal
résiste à `UPDATE`, `DELETE` et `TRUNCATE` **même en superutilisateur** · personne ne peut se nommer
soi-même · le dernier administrateur ne peut pas être retiré · aucun geste sans motif écrit.

**La garde `RequirePlatformAdmin`** est un composant neuf : refus par défaut (chargement, absence de
session, erreur réseau, réponse inattendue). Un visiteur non autorisé voit « page introuvable », pas
« accès refusé ». Un lien « Se connecter » n'apparaît **que** s'il n'y a aucune session.

**Trois pièges de chiffres désamorcés** : le palier passe par `planDisplayName()` (codes croisés en
base) · un abonnement expiré encore marqué « active » n'est pas compté parmi les actifs, et l'écran
le signale · aucun total d'argent n'est calculé, mais un compteur donne les actifs **sans trace de
paiement**.

**Reste pour finir la console** : registre des paiements (rien n'est historisé aujourd'hui — le
chiffre d'affaires du premier mois serait perdu), retrait d'une annonce du catalogue, et les écrans
repoussés de la spec (santé de la place de marché, signalements, incidents).

### 🔑 « Mot de passe oublié » : ne fonctionnait pas du tout — corrigé le 2026-08-12

**Cause racine**, établie par un appel direct au service d'authentification (aucun e-mail envoyé) :
le service **remplace le fragment** (`#…`) de l'URL de retour par ses propres paramètres.

```
redirect_to = https://minegrid-equipement.com/#update-password
-> Location:  https://minegrid-equipement.com/#error=access_denied&error_code=otp_expired…
              (le « #update-password » a disparu)
redirect_to = https://minegrid-equipement.com/?type=recovery
-> Location:  https://minegrid-equipement.com/?type=recovery#error=…   (la query survit)
```

L'application étant routée par le fragment, **le lien ramenait sur la page d'accueil** : l'écran
« définir un nouveau mot de passe » était inatteignable. Personne ne pouvait récupérer son compte.
Deuxième défaut au même endroit : `UpdatePassword` lisait les jetons à la main dans un format
(`#page?access_token=…`) que le service ne produit **jamais**.

Correction : marqueur déplacé dans la query (`?type=recovery`), capture de l'URL au tout premier
chargement (`src/utils/authLink.ts`, importé en tête de `main.tsx`), écran réécrit (attente réelle de
la session, confirmation du mot de passe, message clair si le lien a expiré au lieu d'un retour
silencieux à l'accueil).

**Puis un audit à 34 agents a trouvé 16 défauts — dont 3 BLOQUANTS dans cette correction même**,
reproduits dans le navigateur avant d'être corrigés :

| # | Défaut | Correction |
|---|---|---|
| Piège | L'écran était piloté par un instantané **figé** testé avant le routeur. Une fois affiché, **plus aucun lien ne fonctionnait** (menu, « Aller à la connexion »…) : le routeur par fragment ne fait qu'un re-rendu, jamais un rechargement. Seul F5 en sortait. | `src/hooks/useAuthLinkReturn.ts` : un **état** rendu au routeur à la première navigation |
| Cul-de-sac | Sur lien périmé — le cas le plus fréquent — le bouton « Demander un nouveau lien » ne menait nulle part | Navigation par le routeur interne, plus d'ancres mortes |
| Adresse collante | `?type=recovery` restait dans la barre d'adresse quand aucune session ne s'ouvrait : rechargement, retour arrière ou favori ramenaient indéfiniment sur l'écran d'échec | Nettoyage à chaque sortie |
| Sécurité | `?type=recovery` tapé à la main sur un poste où une session était restée ouverte donnait le formulaire : on pouvait changer le mot de passe **sans le connaître** et verrouiller le titulaire dehors | Un jeton émis par le service est désormais exigé |
| Délai | 8 s d'attente accusaient à tort le lien d'avoir expiré sur connexion lente | 30 s + libellé prudent (« nous n'arrivons pas à vérifier ») |
| Quota | Le refus pour excès d'envois n'était reconnu que sur deux formulations anglaises | Reconnu sur le code HTTP 429 / le code d'erreur |
| Coquille | L'écran s'affichait au milieu du menu et du pied de page du site | Coquille masquée |

**12 tests** ajoutés (`authLink`, `urls`, `useAuthLinkReturn` — dont le test de parcours qui manquait :
« l'écran doit rester quittable ») ; **404/404** au total. Vérifié dans le navigateur à chaque étape.

### 💸 Changement de formule : double facturation (MG-H10) — corrigé, preuve côté code faite

**Le défaut** : un client déjà abonné qui changeait de formule voyait s'ouvrir un **second**
abonnement Paddle au lieu de voir le premier modifié. Il payait deux fois.

⚠️ **Statut exact du constat, pour ne pas se raconter d'histoires.** MG-H10 vient du registre
`docs/audit-final/16-vulnerability-register.md`, coté **HIGH / PROBABLE** — pas « confirmé ». Son
champ preuve dit mot pour mot : « commentaire et flux checkout observés ; **pas de test PSP réel** »,
et « non exécuté sans sandbox Paddle autorisée ». Autrement dit : **le chemin de code est établi**
(relu et vérifié ligne à ligne), **le dommage réel ne l'est pas**. Aucun relevé de doublon effectif
n'existe dans nos traces — ni trois abonnements, ni 600 $/mois. Le nombre d'abonnements réellement
créés en double reste inconnu tant que `.audit/verifier-un-seul-abonnement.mjs` n'a pas tourné.

**Périmètre vérifié** : un abonnement Paddle ne peut naître que de `openPlanCheckout`, appelé depuis
un **seul** endroit (`PaddleCheckoutButton.tsx:147`), lui-même utilisé par les deux seules pages de
paiement (`PaymentPage`, `ProSubscription`). Aucune fonction serveur ne fait de `POST /subscriptions`.
La porte est unique, et elle est gardée.

**Exposition réelle : nulle en production.** Relevé le 2026-08-13 en appelant chaque fonction :

| Fonction | Production | Staging |
|---|---|---|
| `paddle-upgrade` | **non déployée** | déployée |
| `paddle-cancel` | **non déployée** | déployée |
| `paddle-webhook` | **non déployée** | déployée |
| `tenders-ai` | **non déployée** (seule l'ancienne `renders-ai` existe) | non déployée |

Toute la chaîne de paiement vit **uniquement sur staging / bac à sable**. En production, aucun jeton
client Paddle n'est embarqué : le bouton « S'abonner » affiche le message honnête « paiement pas
encore configuré ». **Personne n'a donc jamais pu être débité en production, ni une fois ni deux.**
D'éventuels doublons ne peuvent exister qu'en bac à sable, où ils ne coûtent rien.

**Le correctif** : `supabase/functions/paddle-upgrade/index.ts` — `PATCH /subscriptions/{id}` avec
`proration_billing_mode: prorated_immediately`. L'abonnement existant est modifié, aucun second
n'est créé. Prix lus côté serveur (un `price_id` fourni par le client permettrait de choisir son tarif).

**Trou trouvé en écrivant la preuve** : le front retombait sur le paiement normal dès que
`paddle-upgrade` échouait — fonction non déployée, erreur Paddle 502, réseau coupé. Or
`functions.invoke` **ne lève pas** sur un statut d'erreur : il le range dans `error`, que le code
ignorait. Un 502 passait donc pour « rien à faire » et ouvrait un checkout : le double abonnement
revenait par la porte de service. Corrigé : le front demande d'abord au **serveur** si un accès est
actif ; si oui, il n'ouvre **jamais** de checkout, sauf autorisation explicite du serveur
(`needs_checkout` — cas d'un code promo ou d'un accès hérité, où il n'y a rien à dupliquer).

**Ce qui est prouvé** (`src/components/PaddleCheckoutButton.test.tsx`, 6 cas) : un second abonnement
ne peut naître que d'un checkout ; le test montre qu'aucun checkout n'est ouvert quand un accès est
déjà actif, dans les quatre situations (succès, erreur serveur, fonction injoignable, double-clic).
**Vérifié par mutation** : rejoué sur le code d'avant correctif, il **échoue** (3 cas) — il prouve
donc bien quelque chose.

**Ce qui n'est PAS encore prouvé** : l'état réel chez Paddle (proration, montant, unicité). Cela
exige la clé API. Script fourni : `.audit/verifier-un-seul-abonnement.mjs` — compter les abonnements
actifs avant/après un changement de formule ; attendu **exactement 1**, au nouveau prix, **même
identifiant** qu'avant. Tant que ce relevé n'est pas fait, le correctif est écrit et testé, pas prouvé
en conditions réelles.

### 🚨 Le paquet de production peut être construit contre la MAUVAISE base — garde-fou posé

Le 2026-08-12, un `npm run build` a produit un paquet branché sur la base de **staging**, sans le
moindre avertissement : Vite charge `.env.local` **aussi** pour `vite build`, et ce fichier de
développement écrase `.env`. Un tel paquet mis en ligne = aucun compte, aucune annonce.

- `scripts/verifier-bundle.mjs` s'exécute désormais **automatiquement après chaque build**
  (`postbuild`) : il refuse le paquet s'il ne contient pas la base de production, s'il contient une
  base de test, un secret, ou une URL de retour à fragment. Testé sur le paquet fautif : **refusé**.
- `.env.local` : les deux lignes fautives sont mises en commentaire (sauvegarde `.env.local.avant-2026-08-12`).
  Pour travailler sur staging : `npm run dev -- --mode staging`, jamais `.env.local`.

### 🔒 Trois défauts trouvés le 2026-08-12 en préparant la console — corrigés (migration `p25`)

Découverts en lisant le code, **chacun vérifié dans les fichiers avant correction**, puis prouvés
en base réelle (Docker) : `supabase/tests/p25_org_membership.*` — **11 contre-cas passent**,
et les **20 harnais du projet passent** (aucune régression).

| # | Défaut | Ce que ça permettait | Correction |
|---|---|---|---|
| **C1** | La règle d'écriture `organization_members_insert_admin` (baseline) ne vérifiait que « c'est bien moi » — **rien** sur la société visée ni sur le rôle demandé | N'importe quel compte connecté pouvait se déclarer **propriétaire de n'importe quelle société** : lecture de ses devis, documents, appels d'offres, planning, **et héritage gratuit de son abonnement**. Un membre retiré pouvait se remettre seul. | Règle supprimée + droits d'écriture révoqués. L'appartenance ne s'obtient plus que par invitation nominative (email vérifié). Vérifié : **aucun écran n'écrivait dans cette table** → rien ne casse. |
| **C2** | La société d'équipe n'était créée que par un rattrapage unique de juillet ; rien ne la crée pour un nouvel inscrit | Un client qui achète **Enterprise (200 $, « 5 utilisateurs »)** ne pouvait **inviter personne** — promesse commerciale intenable | Création automatique à l'activation de l'abonnement (déclencheur sur `pro_clients`) + à la première invitation |
| **C3** | `pro_clients.max_users` était renseignée par le webhook Paddle mais **lue nulle part** | Un seul abonné **Premium à 20 $/mois** pouvait inviter un nombre **illimité** de collègues, tous servis gratuitement (abonnement hérité) — fuite de revenus directe | Limite vérifiée à l'envoi **et** à l'acceptation de l'invitation, invitations en attente comprises |

## 🟠 À traiter avant ouverture

| # | Sujet | Qui | Détail |
|---|---|---|---|
| A1 | **IA appels d'offres non déployée** | Patron | `npx supabase functions deploy tenders-ai --project-ref tnfbggrftmtxpgbcwqzo` (correctif streaming committé `a6b62651`) |
| A2 | **Délivrabilité e-mail** (SPF/DKIM absents ?) | Patron | Sans ces enregistrements DNS, les confirmations d'inscription risquent le spam chez Gmail/Outlook |
| A3 | **Édition simultanée AO** (dernière écriture gagnante) | Assistant | Verrouillage optimiste — évolution, non bloquante à 1 utilisateur |
| A4 | **Export Word = HTML renommé .doc** | Assistant | Avertissement à l'ouverture dans Word — confort |
| A5 | **Aucune vérification d'adresse e-mail à l'inscription** | **Décision patron** | Le modèle « Confirmez votre inscription » existe mais n'est jamais envoyé : n'importe qui peut créer un compte avec l'adresse d'un tiers. Sur une place de marché portant annonces, devis et dossiers, c'est une usurpation possible. Soit activer la confirmation dans Supabase, soit l'assumer explicitement dans `docs/decisions/` |
| A6 | **Liste des URLs de retour absente du dépôt** (`supabase/config.toml`) | Patron + Assistant | La liste blanche vit uniquement dans le tableau de bord Supabase : invisible, non versionnée, divergente entre prod et staging (staging accepte `localhost`, pas la prod → le parcours n'y est pas reproductible à l'identique) |
| A7 | **Route par chemin `/update-password`** | Patron | Le `.htaccess` part bien dans le paquet (vérifié) ; reste à confirmer que la réécriture est active chez l'hébergeur. Non bloquant : le parcours ne passe plus par ce chemin |

---

## ✅ Fait et prouvé

- **Sécurité** : audit complet, RLS durcies, isolation inter-sociétés prouvée en Docker (contre-cas),
  jeton admin hors bundle public, gardes de session réelles sur toutes les routes payantes.
- **Abonnements** : grille validée (Gratuit / Premium 20 $ / Pro 50 $ / Enterprise 200 $ USD),
  **cycle complet prouvé sur staging** : checkout Paddle → webhook signé → activation base →
  verrous levés → **résiliation réelle** (annulation programmée). Idempotence prouvée (3 livraisons, 1 traitement).
  ⚠️ Piège permanent : codes internes CROISÉS ('pro' = affiché « Premium », 'premium' = affiché « Pro ») —
  source unique `src/config/plans.ts`, tout affichage via `planDisplayName()`.
- **Appels d'offres** : mode partagé par société (migrations teamA+teamE, preuve Docker 10/10),
  vérification par 36 agents → 22/24 anomalies corrigées, palette sobre, doc d'exploitation sortie du produit.
- **Vérité d'affichage** : plus de dates/notifications/statistiques fictives, provenance IA honnête.
- **Environnements** : staging = jumeau du schéma prod + 500 annonces réelles + Paddle sandbox + radar + IA.

---

## Repères

| | |
|---|---|
| **Dossier de travail (unique)** | `C:\Users\Public\projets\SITE_MINEGRID_EQUIPEMENT_COVER\SITE_MINEGRID_EQUIPEMENT_cover 1` |
| **Prod locale** (vraies données) | `minegrid-dev.bat` → port **5188** |
| **Staging** (bac à sable) | `minegrid-staging.bat` → port **5199** |
| **Radar (service local)** | Docker `services/monitor-service` → port **8010** (8000 pris par un autre projet) |
| **Supabase prod / staging** | `tnfbggrftmtxpgbcwqzo` / `vrouxqofmlbkxgznftja` |
| **Branche git** | `fix/audit-remediation` — **jamais de push** (dépôt public) |
| Anciennes copies | archivées dans `C:\Users\Public\projets\_ARCHIVE_2025_ne_pas_deployer` (pointaient vers la base morte) |

Runbooks : `.audit/PADDLE_SETUP.md` · `docs/TENDERS_OPERATIONS.md` · `.audit/STAGING_SETUP.md` ·
`docs/OPERATIONS_SUPABASE.md` · actions patron : `docs/build/ACTIONS_PATRON.md`

---

## Ce qui marchera / ne marchera pas juste après la mise en ligne

| ✅ Fonctionne dès le téléversement | ❌ Ne fonctionne pas encore |
|---|---|
| Inscription, connexion, mot de passe oublié | **Paiement par carte** → message honnête : « paiement pas encore configuré, utilisez un code promo ou contactez le support » (B2) |
| Catalogue, recherche, fiches machines, devis, messagerie | **IA des appels d'offres** → mention « mode simulation » tant que A1 n'est pas fait |
| Publication d'annonces, dossiers, tableaux de bord | **Administration de la plateforme** → aucune console (B3) |
| Appels d'offres (cycle complet, hors IA), Global Monitor | Confirmations d'inscription : risque de spam tant que SPF/DKIM absents (A2) |
| Codes promo (vérifiés côté serveur) → seule voie d'accès payant | |

---

## Prochaine action

**Patron**, dans l'ordre :
1. Appliquer `.audit/APPLY_P27_ADMIN_ABONNES.sql` puis `.audit/APPLY_P28_CONTACT_PROMO.sql` —
   **staging d'abord**, prod ensuite. Sans elles, les onglets Abonnés, Messages et Codes promo
   affichent une erreur.
2. Créer le compte administrateur **en production** (il n'existe qu'en staging).
3. Téléverser `minegrid-site.zip` (débloque la connexion pour tous les visiteurs).
4. Déployer les fonctions : `paddle-upgrade` (correctif du changement de palier) et `tenders-ai`.
   ⚠️ La CLI ne relit pas les identifiants de `supabase login` sur cette machine (CLI 2.113.0,
   gestionnaire d'identifiants Windows) : passer par `$env:SUPABASE_ACCESS_TOKEN`.

**Assistant** : registre des paiements (le plus urgent — rien n'est historisé), puis retrait
d'annonce du catalogue.

## En attente, sans blocage

- Jetons Supabase : 6 existants, dont 2 jamais utilisés et 1 expiré. Ménage à faire (chacun est une
  clé permanente vers tout le compte). Vérifié : aucune automatisation du dépôt ne les consomme.
- Le 502 de `paddle-upgrade` : traité à l'aveugle par le correctif du 2026-08-14 (levée du
  changement programmé), **à confirmer** une fois la fonction redéployée.
