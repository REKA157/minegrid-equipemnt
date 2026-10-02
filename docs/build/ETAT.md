# ETAT — MineGrid Équipement

> Tableau de bord du projet. **À lire en début de session, à mettre à jour avant chaque commit.**
> Dernière mise à jour : **2026-10-02** — code promo en échec (index unique manquant), correctif prouvé

---

## 🎟️ Code promo en échec : index UNIQUE manquant sur `pro_clients.user_id` (2026-10-02)

**Le défaut, reproduit en Docker.** `redeem_promo_code` (et `paddle-webhook`) activent l'abonnement par
`INSERT INTO pro_clients … ON CONFLICT (user_id) DO UPDATE`. Or en **production**, `pro_clients.user_id`
n'a qu'un **index simple** (`idx_pro_clients_user_id`), **pas d'unique** → Postgres lève
`42P10 : there is no unique or exclusion constraint matching the ON CONFLICT specification`, et **toute
rédemption de code promo échoue**. Le site en ligne pointant déjà la base morte masquait le symptôme ;
branché sur la vraie base, le code promo plantait quand même — d'où « aujourd'hui même il ne marche pas ».

**Pourquoi passé inaperçu.** La migration `20260717100000_paddle_payments.sql` crée pourtant cet index
(dédoublonnage + `create unique index pro_clients_user_id_key`) mais **n'a jamais été appliquée**. Le
comparateur le **documentait** (commentaire « index unique pro_clients → code promo et webhook Paddle en
échec ») **sans le vérifier**. Le test de l'audit (p15) passait car son `pro_clients` de test avait, lui,
une unicité sur `user_id` — mismatch test/prod classique.

**Prouvé (Docker, 2026-10-02).** Sur un `pro_clients` identique à la prod (index simple) : l'appel
**plante** ; après le correctif → utilisateur 1 `{"ok": true}` + abonnement « active », 2ᵉ fois « déjà
utilisé » (sans plantage), quota respecté. `uses_count` reste à 0 après le plantage (rollback, aucune
corruption).

**Correctif livré, à appliquer par le patron.** `.audit/APPLY_CORRECTIF_CODE_PROMO.sql` (dédoublonnage +
index unique, idempotent) — **STAGING d'abord, puis PROD**. Même famille que les objets « écrits mais
jamais appliqués » listés par `npm run bases`.

---

## 📡 Global Monitor cassé en ligne : la politique de sécurité bloquait le radar (2026-10-01)

**Bilan complet, 27 points sondés** : https://claude.ai/artifact/Ld4PT26jd116VBTKCh5vnT
(7 cassés, 1 exposé, 5 absents, 7 limités, 6 fonctionnent, 1 non vérifié).

**La cause, prouvée dans un vrai navigateur** : le service du radar fonctionne
(`/health` → 200, CORS correct, 401 sans compte comme prévu, `get_effective_subscription_for`
présente et protégée). C'est la directive `connect-src` de `public/.htaccess` qui n'autorisait pas
`monitor.minegrid-equipement.com`. La console du site en ligne le dit en toutes lettres :
« *violates the following Content Security Policy directive* ». Touchés : Global Monitor,
Opportunités de vente, widgets IA du tableau de bord.

**Pourquoi personne ne l'avait vu** : l'essai du paquet du 2026-08-12 (plus bas, « radar de prod
joignable, zéro erreur console ») passait par `vite preview`, **qui ignore `.htaccess`**. L'essai
était juste, mais il ne testait pas la politique.

**Corrigé (dépôt + `dist/`, rien en production)** :
- domaine du radar ajouté à `connect-src` (`public/.htaccess`, et `public/_headers` par cohérence) ;
- `scripts/csp.mjs` lit une politique ; `verifier-bundle.mjs` (après chaque build) **refuse un
  paquet dont la politique bloque la base ou le radar** — il refusait bien le paquet d'avant ;
- `verifier-deploiement.mjs` compare aussi la politique **servie en ligne** : `.htaccess` est un
  fichier caché que beaucoup de logiciels FTP n'envoient pas ;
- `scripts/servir-paquet.mjs` (port 4173, `minegrid-paquet` dans le launch.json de session) sert
  `dist/` **avec** les en-têtes de `.htaccess`. Preuve : radar `/health` → 200 depuis ce serveur ;
- 17 tests (`csp.test.ts` 13, `verifierDeploiement.test.ts` +4), trois mutations détectées.
  Suite complète : **668/668**, types OK, build OK.

**Trouvé au passage, non corrigé (décision ou production)** :
- **`renders-ai` toujours ouverte** au 2026-10-01 : `ping` avec la clé publique → 200, `hasKey: true` ;
- **détection du pays bloquée** par la même politique (api.country.is, get.geojs.io, ipapi.co) :
  repli sur la langue du navigateur, donc des euros pour un visiteur marocain en « fr-FR ».
  Débloquer = envoyer l'IP de chaque visiteur à trois tiers → **décision RGPD du patron** ;
- **taux de change figés** dans `exchange_rates()` (valeurs en dur datées `now()`), fonction
  `exchange-rates` non déployée ;
- **page « Documentation API »** : décrit `api.minegrid-equipment.com`, domaine inexistant ;
- radar local Docker : 16 134 redémarrages (échec DNS au démarrage), sans effet en ligne.

**Reste non vérifié** : un abonné Pro voit-il les projets ? Exige un compte payant → au patron,
après téléversement.

---

## 🔍 La recherche du catalogue passe CÔTÉ BASE (2026-09-29)

**Le défaut, mesuré** : 16 397 annonces en base, mais la page « Machines » n'en téléchargeait que
400 (3 000 au maximum) et faisait le filtrage, la recherche et le tri **dans le navigateur**, sur
ces lignes-là seulement.

| | Avant | Après |
|---|---|---|
| Recherche « Hitachi » | **0 résultat** (113 en vente) | **124 annonces** |
| Recherche « Caterpillar » | **0 résultat** (11 en vente) | **11 annonces** |
| Lien `marque=Komatsu&anneeMin=2018` | filtres perdus | **300 annonces**, chiffre identique à la base |
| Part du catalogue atteignable | 18 % | **100 %** |
| Compteur affiché | aucun | « 16 397 annonces correspondent — 400 affichées » |

La base n'était pas en cause : elle répond en 0,23 s sur la première ligne et 0,27 s sur la
16 000ᵉ. On ne lui demandait simplement jamais de filtrer.

**Fonctionne DÈS MAINTENANT, sans migration.** Recherche, marque, catégorie, secteur, état et
année passent côté base immédiatement. Le module détecte l'absence de la migration `p33` et le
dit en console plutôt que de casser.

**Ce que la migration `p33` ajoute** (à appliquer par le patron) :
- une vue `machines_catalogue` avec le prix converti en nombre — `machines.price` est stocké en
  **texte**, donc « entre 50 000 et 200 000 » est impossible sans elle ;
- `catalogue_facettes()` : les **449 marques réelles** au lieu des 44 déduites des annonces
  chargées ;
- quatre index, dont un index d'expression sur le prix — **vérifié utilisé** (`Index Scan`).

⚠️ **Point de sécurité, prouvé** : la vue porte `security_invoker = true`. Sans cette option, le
contre-cas montre qu'elle expose **8 annonces là où la RLS n'en autorise que 2** — une fuite
complète. Le contre-cas 12 recrée volontairement la vue sans l'option pour prouver que le
contre-cas 9 mord vraiment.

**Trois défauts corrigés au passage**, tous vérifiés :
- le piège `noFilters` a disparu avec le filtrage en mémoire : il énumérait les dix filtres à la
  main et court-circuitait tous les tests si aucun n'était posé — un onzième filtre oublié dans
  cette liste se serait affiché sans rien filtrer ;
- l'adresse du navigateur ne portait que 5 filtres sur 10 et **ajoutait une entrée d'historique à
  chaque lettre tapée** (« caterpillar » = 11 entrées, bouton Retour cassé). Mesuré après
  correction : **0 entrée ajoutée** ;
- **mon propre défaut, trouvé en testant** : la relecture de l'adresse posait les filtres présents
  mais n'effaçait pas les absents. Ouvrir un lien `marque=Komatsu` en gardant une recherche
  « Hitachi » affichait « aucune annonce » sans explication. L'adresse est désormais la source de
  vérité.

**Reste connu** : `bulldozer` (3 622 annonces) et `chargeuse-pneus` (634) ne sont rattachés à
aucun groupe et tombent dans « Construction » par défaut. Comportement existant, figé par un test.
Les reclasser déplacerait 4 000 annonces d'un secteur à l'autre : décision produit.

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

### Priorité 3 (suite) — la logique métier enfouie, sortie et testée

Deux pages parmi les plus grosses cachaient de la logique **pure et non testée**, non par
négligence mais parce qu'on ne pouvait pas l'atteindre : il fallait monter la page entière, et la
page exige une session, une organisation, des données.

| Sortie de | Vers | Ce que ça protège |
|---|---|---|
| `MachineDetail.tsx` (1 166 → 1 120) | `machineDetailHelpers.ts` + **17 tests** | La table `machines` porte **quatre colonnes concurrentes** pour le vendeur (`seller_id`, `sellerid`, `user_id`, `owner_id`). Le choix entre elles décide **à qui part la demande de devis d'un client**. La priorité est alignée sur la fonction serveur `send-contact-email` : les deux doivent rester d'accord. |
| `MultiUserManagement.tsx` (1 228 → 1 153) | `multiUserHelpers.ts` + **18 tests** | La traduction rôle → permissions **affichées**. Les permissions réelles viennent de la RLS ; si les deux divergent, l'écran ment à l'utilisateur sur ce qu'il a le droit de faire. |

**Vérifiés par mutation**, parce qu'un test qui passe ne prouve rien tant qu'on n'a pas vu
échouer : inverser la priorité des colonnes vendeur → 1 échec ; laisser passer les identifiants
factices `00000000-…` → 2 échecs ; faire retomber un rôle inconnu sur « toutes permissions » au
lieu de « tableau de bord » → 1 échec.

**573 tests** au total (463 au début de la séance).

## 🐛 Trois défauts RÉELS trouvés en cartographiant les gros fichiers (2026-09-28)

Le découpage des gros fichiers a révélé des bugs bien plus importants que le problème de lignes.
Les trois ci-dessous sont **confirmés par lecture du code**, corrigés, et verrouillés par des
tests vérifiés par mutation.

### 1. Tout lien de vitrine partagé par un vendeur ouvrait une page VIDE 🔴

`getSellerIdFromHash` lisait l'identifiant avec `/^#vitrine\/?(\w+)?/`. Or `\w` vaut
`[A-Za-z0-9_]` et **n'inclut pas le tiret**, alors que les identifiants Supabase sont des UUID à
tirets. `#vitrine/3f2b1c4a-9d7e-4f11-8a20-0b6c5d4e3f21` devenait `3f2b1c4a`.

Cet identifiant tronqué ne correspondait à aucune ligne, l'erreur PGRST116 était avalée en
silence, et la page s'affichait vide — **sans message d'erreur**. Les trois endroits qui
fabriquent ce lien passent pourtant un UUID complet : le bouton « Voir en public », le bouton
« Voir vitrine du professionnel » d'une fiche machine, et le texte qui invite le vendeur à
partager `votre-site.com/#vitrine/<user_id>`.

Autrement dit : un vendeur envoyait le lien de sa vitrine à ses clients, et ses clients ne
voyaient aucune de ses machines.

Le test existant passait au travers parce qu'il utilisait `#vitrine/vendeur1` — une valeur sans
tiret, commode mais irréelle. Les nouveaux tests n'emploient que de vrais UUID ; remettre
l'ancienne expression en fait échouer 4.

### 2. Rétrograder un membre ne changeait RIEN en base 🔴

`handleUpdateMember` ne faisait qu'un `setTeamMembers` en mémoire. La fonction serveur
`setOrgMemberRole` (RPC `set_org_member_role`, **présente dans les deux bases**) existait et
n'était appelée **nulle part** dans `src/`.

Un administrateur qui rétrogradait un « Administrateur » en « Lecteur » voyait l'écran changer,
partait rassuré — et la base gardait `admin`. Au rechargement l'ancien rôle revenait, et la
personne conservait tous ses droits côté RLS. **Un droit retiré à l'écran mais conservé en base
est pire que pas de bouton du tout : il fait croire que l'accès est coupé.**

Corrigé : le rôle part au serveur, et en cas de refus la fenêtre reste ouverte avec le motif —
mieux vaut un échec visible qu'un succès imaginaire.

### 3. Un échec de lecture ÉLARGISSAIT les droits 🟠

Le chargement des affectations (Commercial / Appels d'offres) avait un `catch` qui gardait « le
défaut », c'est-à-dire **accès à tout**. Un échec de lecture se confondait donc avec « ce membre
a tous les accès » : rouvrir puis enregistrer la fiche d'un membre volontairement restreint lui
rendait les deux espaces.

Corrigé par un drapeau `affectationsConnues` : quand la lecture a échoué, l'enregistrement
s'abstient et le dit. Un échec de lecture ne doit jamais élargir des droits.

### Au passage : deux boutons muets pour un lecteur d'écran

Les boutons « modifier » et « retirer » d'un membre étaient des icônes sans `title` ni
`aria-label` — celui de l'historique, juste à côté, les avait. Un lecteur d'écran annonçait
« bouton » trois fois de suite, sans rien pour distinguer « modifier » de « retirer un membre ».

---

### ✅ `strictNullChecks` est désormais ACTIF dans le build

Le constat était juste et pire que décrit : `tsconfig.app.json` déclarait `strict: true`, mais
`npm run build` lance `tsc` sans `-p`, donc lit `tsconfig.json` où tout valait `false`. Les deux
configurations orphelines promettaient une rigueur que rien n'appliquait — deux audits l'avaient
signalé sans que la contradiction soit levée.

**Piège qui aurait fait échouer la correction naïve** : écrire `"strict": true` n'aurait PAS suffi.
Les options posées explicitement à `false` (`noImplicitAny`, `noImplicitThis`…) l'emportent sur la
valeur héritée de `strict`. On aurait cru activer la rigueur et on n'en aurait eu que la moitié.

**Fait** : 50 erreurs corrigées sur 11 fichiers, **sans un seul `any`, `as any`, `!` ou
`@ts-ignore`** — un raccourci aurait activé une vérification pour la désactiver aussitôt. Chaque
correction a été relue par un second agent chargé de la contredire, diff en main.

`strictNullChecks: true` est maintenant dans `tsconfig.json`, et les deux configurations orphelines
héritent de la vraie : elles ne peuvent plus diverger. **Vérifié en cassant exprès** : un accès sur
une valeur possiblement nulle fait désormais échouer `npm run build` (`TS18047`).

**Trois vrais défauts mis au jour par le typage :**

1. **`DashboardConfigurator` enregistrait tous les widgets à `position: 0`.** Le code lisait
   `layout.find(...)?.position`, or les objets de disposition de `react-grid-layout` portent
   `i, x, y, w, h` et **jamais** `position`. L'expression valait donc toujours `undefined`, puis 0 :
   l'ordre des widgets voulu par l'utilisateur était perdu à la sauvegarde. Corrigé aux deux
   endroits. **C'est le relecteur adversarial qui l'a vu**, l'agent s'étant arrêté au typage.
2. **Les écrans professionnels écrivaient des données inventées en production** (voir plus bas) —
   `strictNullChecks` signalait « propriété inexistante sur le type `never` » sur les six lignes
   fautives. Le compilateur disait, correctement, que la branche défensive était morte.
3. **`PaddleCheckoutButton`** avait une conversion auto-référentielle (`as typeof corps`) qui
   annulait toute vérification sur le chemin traduisant les refus de paiement Paddle.

**Paliers suivants, chiffrés :** `noImplicitAny` ≈ 50 erreurs mécaniques ; puis les **12 fichiers
`.js`/`.jsx` non typés** de `src` (3 030 lignes que rien ne vérifie, ni avant ni après).
⚠️ Ces 50 sont un **plancher, pas un plafond** : le dépôt compte 164 `: any` et 89 `as any`, qui
neutralisent la vérification de nullité. Chaque `any` retiré en révélera de nouvelles.

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
  ⚠️ *2026-10-01 : `vite preview` ignore `.htaccess`, donc cet essai ne testait pas la politique de
  sécurité — qui bloquait le radar en ligne. Utiliser `scripts/servir-paquet.mjs` (port 4173).*

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
| Appels d'offres (cycle complet, hors IA), Global Monitor (**seulement si `.htaccess` est téléversé avec le paquet** — 2026-10-01) | Confirmations d'inscription : risque de spam tant que SPF/DKIM absents (A2) |
| Codes promo (vérifiés côté serveur) → seule voie d'accès payant | |

---

## ⚠️ À savoir sur l'historique git de la séance du 2026-09-28

Le commit **`d16802c9`** (« Hygiène — 35 fichiers morts archivés… ») contient **plus que son
titre** : un `git add` trop large de ma part y a joint **24 fichiers de travail déjà en cours**
avant ce commit, sans rapport avec l'archivage — `SellEquipment.tsx`, `PaddleCheckoutButton.tsx`,
`quoteRequests.ts`, `TransactionCasePage.tsx`, plusieurs fichiers de test, etc.

**Rien n'est perdu** : ces fichiers sont versionnés, simplement sous un message qui ne les décrit
pas. Je n'ai pas réécrit l'historique pour les en sortir, parce que je ne peux pas établir leur
provenance avec certitude — plusieurs viennent probablement de travaux antérieurs de cette même
séance. Découper à l'aveugle aurait été pire que le défaut.

Le commit suivant (`strictNullChecks`) a eu le même début de problème sur 4 fichiers
(`plans.ts`, `plans.test.ts`, `main.tsx`, `tendersSync.ts`) : là, l'erreur a été vue et **corrigée
avant d'aller plus loin** — ils sont ressortis du commit et sont redevenus du travail non commité.

Si vous voulez un historique propre sur `d16802c9`, dites-le : c'est faisable, l'historique est
purement local (rien n'a jamais été poussé).

---

## Prochaine action

**Patron**, dans l'ordre :
0 avant tout. **Code promo cassé → appliquer `.audit/APPLY_CORRECTIF_CODE_PROMO.sql`** (SQL Editor :
   **staging puis prod**). Index unique manquant sur `pro_clients.user_id` : sans lui, aucune rédemption
   de code promo n'aboutit — or c'est la **seule voie d'accès payant** aujourd'hui. Prouvé en Docker.
00. **Couper ou protéger `renders-ai`** (toujours ouverte au 2026-10-01), puis **téléverser
   `dist/` avec `.htaccess`** (afficher les fichiers cachés dans le logiciel FTP) et lancer
   `npm run verifier:deploiement` : il doit passer au vert, radar compris. Ensuite, ouvrir le
   Global Monitor avec un compte Pro. Bilan : https://claude.ai/artifact/Ld4PT26jd116VBTKCh5vnT
0. **Appliquer `.audit/APPLY_P33_RECHERCHE_CATALOGUE.sql`** (staging puis prod). Le catalogue
   cherche déjà côté base sans elle ; cette migration ajoute le filtre/tri par **prix** et les
   **449 marques** au lieu de 44. 12 contre-cas passés sur base vierge, dont un qui prouve que
   la vue ne contourne pas la RLS.
0 bis. **Déployer les fonctions serveur** — 2 sur 13 seulement répondent aujourd'hui, et sans
   `paddle-webhook` un paiement réussi n'active aucun abonnement. Mode d'emploi complet :
   `docs/build/deployer-fonctions.md`.
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

### Reste du chantier hygiène (priorité 3)

Douze fichiers dépassent encore 1 000 lignes. Les onze cartographiés l'ont tous été avec le même
verdict : **« tests d'abord »**. Chacun a désormais un plan de découpe écrit — lignes exactes,
dépendances de chaque bloc, cas de test à écrire. Rien n'est à redécouvrir.

| Fichier | Lignes | Tests | Gain identifié |
|---|---|---|---|
| `VitrinePersonnalisee.tsx` | 2 062 | 24 | 1 248 l. en 11 extractions |
| `PublicationRapide.tsx` | 1 957 | aucun | 1 461 l. en 12 extractions |
| `pro/widgets/EquipmentTab.tsx` | 1 806 | aucun | 1 320 l. en 10 extractions |
| `dashboard/widgets/SalesPipelineWidget.tsx` | 1 607 | aucun | 598 l. |
| `dashboard/widgets/StockStatusWidget.tsx` | 1 588 | aucun | 834 l. |
| `WidgetRenderer.tsx` | 1 497 | 47 (fumée) | 979 l., dont les 9 widgets que le script avait refusés |
| `MultiUserManagement.tsx` | 1 200 | 21 | 462 l. |
| `pro/widgets/OrdersTab.tsx` | 1 174 | aucun | 635 l. |
| `MachineDetail.tsx` | 1 129 | 17 | 403 l. |
| `TransactionCasePage.tsx` | 1 118 | 2 | 457 l. |
| `SellEquipment.tsx` | 1 113 | 6 | 544 l. |
| `components/SalesEvolutionWidgetEnriched.tsx` | 1 026 | aucun | non cartographié |

**La méthode qui a marché, à réutiliser** : extraction par programme (jamais retapée), avec un
script qui refuse tout cas qu'il ne sait pas traiter ; `tsc` après chaque étape avec annulation
automatique en cas d'échec ; tests écrits avant ou pendant ; et **vérification par mutation** —
casser volontairement le code pour voir le test échouer. Un test qui n'a jamais échoué ne prouve
rien.

### Défauts identifiés et VOLONTAIREMENT non corrigés — à trancher

Ce sont des décisions produit, pas des corrections techniques. Chacune est documentée en
commentaire à l'endroit exact du code.

| Où | Quoi | Pourquoi je n'ai pas tranché |
|---|---|---|
| `StockStatusWidget` | « dumper » est classé **Camion** avant d'atteindre la branche **Tombereau** | Déplacer le mot reclasserait des machines déjà en base |
| `EquipmentTab` | Le statut du formulaire (`active/maintenance/inactive/sold`) ne correspond pas à la contrainte de la base (`available/sold/reserved`) | « Inactif » veut-il dire « réservé » ou « retiré de la vente » ? Le champ est désormais en lecture seule et le dit. |
| `EquipmentTab` | Pas de colonne `location` dans `machines` — il y a `city`, `address`, `region`, `country` | Laquelle alimenter est un choix métier. Champ en lecture seule et le dit. |
| `PublicationRapide` | `loadAnalyticsData()` lit l'état `machines` encore vide dans sa fermeture : **au premier chargement le vendeur voit 0 vue** et doit cliquer « Actualiser » | Correction sûre, mais elle touche au flux de chargement : mérite son propre passage avec tests |
| `autoSpecsService` | Un poids inconnu est pré-rempli à **0 kg** dans le formulaire de publication | Une annonce peut partir à 0 kg et sortir des filtres par tonnage côté acheteur |
| `SalesPipelineWidget` | Un lead **jamais contacté** n'est jamais signalé « bloqué » (`new Date(undefined)` → NaN, et `NaN > 7` est faux) | Latent : le type déclare `last_contact` non nul, mais tout le chemin est en `any`, donc invérifiable en l'état |

### Rigueur TypeScript — paliers suivants

`strictNullChecks` est **actif** dans le build. Restent, chiffrés : **`noImplicitAny`** (~50 erreurs
mécaniques) puis les **12 fichiers `.js`/`.jsx`** de `src` (3 030 lignes que rien ne vérifie, ni
avant ni après).
⚠️ Plancher, pas plafond : 164 `: any` et 89 `as any` neutralisent encore la vérification de
nullité. Chaque `any` retiré en révélera de nouvelles.

### Code mort restant

15 fichiers gardés volontairement (voir `archive/code-mort/README.md`) : fonctionnalités annoncées
en attente de branchement, ou composants d'usage général plausible. À réexaminer quand la
fonctionnalité correspondante sera branchée — ou abandonnée.

## En attente, sans blocage

- Jetons Supabase : 6 existants, dont 2 jamais utilisés et 1 expiré. Ménage à faire (chacun est une
  clé permanente vers tout le compte). Vérifié : aucune automatisation du dépôt ne les consomme.
- Le 502 de `paddle-upgrade` : traité à l'aveugle par le correctif du 2026-08-14 (levée du
  changement programmé), **à confirmer** une fois la fonction redéployée.
