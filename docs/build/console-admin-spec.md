# SPEC — Console d'administration de la plateforme (v1)

**Projet** : MineGrid Équipement · **Date** : 12 août 2026 · **Statut** : à valider par le patron
**Répond au bloquant** `B3` de `docs/build/ETAT.md` (« Aucune console d'administration »)

---

## 1. Objectif

Donner à MineGrid — l'exploitant de la plateforme, et non les sociétés clientes — un **vrai compte administrateur**, révocable et tracé, avec les quelques écrans qui permettent de tenir une boutique payante : voir qui est abonné, débloquer un client, créer un code promo, lire les messages reçus, retirer une annonce et suivre les encaissements.
Tout ce qui se fait aujourd'hui à la main dans le tableau de bord Supabase doit se faire depuis le site, sous un compte identifié, avec une trace écrite de chaque geste.

---

## 2. Deux corrections bloquantes découvertes en lisant le code

Elles ne font pas partie de la console, mais **la console n'a pas de sens tant qu'elles ne sont pas faites**. Elles sont chiffrées dans le Lot 0.

| # | Ce qui ne va pas | Conséquence concrète | Vérifié dans |
|---|---|---|---|
| **C1** | N'importe quel compte connecté peut s'ajouter lui-même comme **propriétaire de n'importe quelle société**, avec le rôle de son choix. | Un ancien collaborateur qu'on vient de retirer d'une équipe **peut se remettre tout seul** (il connaît l'identifiant de sa société) : il retrouve les devis, documents, appels d'offres, planning… **et hérite gratuitement de l'abonnement Enterprise** du propriétaire. Le bouton « retirer un membre » livré en juillet ne coupe donc rien durablement. | `supabase/migrations/00000000000000_baseline.sql` lignes **6168** (règle d'écriture) et **7440** (droits) ; héritage d'abonnement : `20260708150000_teamD_shared_subscription.sql` |
| **C2** | La création de la « société » (l'espace d'équipe) a été faite **une seule fois**, en juillet, sur les comptes existants. Rien ne la crée pour un nouveau client. | Un client qui achète **Enterprise à 200 $ (« Équipe : 5 utilisateurs »)** aujourd'hui reçoit son abonnement… mais **ne peut inviter personne** : la fonction d'invitation refuse. La promesse commerciale n'est pas tenue et il faut corriger à la main en base. | `20260708120100_teamA_backfill_orgs.sql` (bloc exécuté une fois) et `20260708140000_teamC_invitations.sql` |

**Bonne nouvelle sur C1** : aucun écran du site n'écrit dans cette table (vérifié par recherche dans tout `src/`), et le seul chemin légitime — accepter une invitation — passe par une fonction serveur qui n'est pas concernée. **Fermer la faille ne casse rien.**

---

## 3. Périmètre de la v1 (P0) — strictement ce qui permet d'ouvrir aux premiers clients payants

### Ce qui est dans la v1

| Lot | Livrable | Pourquoi c'est indispensable pour ouvrir |
|---|---|---|
| **0** | Fermeture de la faille C1 + création automatique de la société à l'activation (C2) | Vendre des accès payants pendant qu'on peut s'en offrir un gratuitement est intenable. Et Enterprise doit tenir sa promesse « 5 utilisateurs ». |
| **1** | **Compte administrateur réel** : identité en base, révocable, journal des actions, route `#admin` protégée | Sans ça, aucun écran ci-dessous ne peut exister sans ouvrir une porte à tout le monde. |
| **2** | Écran **Abonnés** (liste + fiche client) et **4 gestes de dépannage** (prolonger, changer de palier, suspendre, réactiver) | C'est l'écran ouvert dix fois par jour et la réponse à « mon accès ne marche pas ». |
| **3** | **Codes promo** (créer, lister, voir qui les a utilisés) + **boîte de réception Contact** | Tant que Paddle live n'est pas ouvert (bloquant B2), **le code promo est le seul moyen propre d'activer un client**. Et le formulaire de contact du site est aujourd'hui **illisible depuis l'application** : les messages arrivent, personne ne les voit. |
| **4** | **Registre des paiements** (le webhook Paddle enregistre chaque mouvement) + écran **Paiements** minimal | Aujourd'hui **rien n'est historisé** : seul l'état courant est gardé. Sans ce registre, le chiffre d'affaires du premier mois d'activité est **définitivement perdu**. À poser avant le premier vrai paiement, pas après. |
| **5** | **Retirer une annonce du catalogue** (avec motif) | Une place de marché ouverte au public doit pouvoir retirer une annonce frauduleuse ou illicite le jour même. Aujourd'hui c'est impossible, même en base : les 10 000 annonces importées n'ont pas de propriétaire et personne ne peut les modifier. |

### Ce qui est repoussé après l'ouverture

| Repoussé | Pourquoi ça peut attendre |
|---|---|
| Écran « Santé de la place de marché » (annonces/semaine, devis, vues) | Utile quand il y a du trafic à observer ; ne bloque pas une vente. |
| File de signalements « Signaler cette annonce » | Le bouton de retrait manuel (Lot 5) suffit tant que les signalements arrivent par e-mail. |
| Écran « Incidents » (paiements échoués, invitations expirées, quotas IA) | Se lit à la main dans les premières semaines, à 5–10 clients. |
| Vue détaillée de l'équipe d'un client, export de données, traitement outillé des demandes RGPD | Les demandes seront rares au démarrage et peuvent être traitées au cas par cas, à condition que le journal (Lot 1) existe. |
| Rôles fins (support / finance / modération), alertes e-mail quotidiennes, consultation « en tant que » un client | Inutile à une ou deux personnes. La colonne de rôle est posée dès le Lot 1 pour ne pas avoir à tout reprendre. |
| Reprise de l'outil interne `#admin-sources` (radar) sous le compte admin | Son jeton d'accès est aujourd'hui **dans le code du site** : le corriger demande un chantier côté service radar (FastAPI), hors console. |
| Correction de deux défauts repérés dans la page « Gestion d'équipe » client (changement de rôle non enregistré, sélecteur de statut sans effet) | À traiter en étape séparée, mais **à ne pas reproduire** dans la console. |

---

## 4. Les écrans, décrits simplement

Une seule adresse : `#admin`, avec un menu à gauche. Invisible pour tout le monde sauf les administrateurs : un client qui tape l'adresse voit un écran « page introuvable », pas « accès refusé » (il n'a pas à apprendre que la console existe).

**1. Abonnés** — un tableau : société, titulaire (nom + e-mail), palier **avec son nom commercial**, statut, date de début, échéance, jours restants, moyen de paiement, sièges utilisés, dernière connexion. Filtres : par palier, par statut, « expire sous 7 jours », recherche par e-mail ou société. En haut, cinq compteurs : abonnés réellement actifs, répartition par palier, revenu mensuel théorique, nouveaux du mois, expirations à venir.

**2. Fiche d'un client** (au clic) — son identité, son abonnement, ses sièges, ses annonces publiées, ses derniers paiements, et les dix dernières actions d'administration faites sur ce compte. Quatre boutons, chacun **exigeant un motif écrit** : prolonger de X jours, changer de palier, suspendre, réactiver. Si le compte est facturé par Paddle, un avertissement s'affiche : *« ce compte est facturé automatiquement ; une prolongation faite ici sera écrasée au prochain renouvellement — passez par un code promo »*.

**3. Codes promo** — la liste des codes (code, palier offert affiché sous son nom commercial, durée, utilisés / maximum, expiration, actif), un bouton pour en créer un, et le détail « qui l'a utilisé et quand ». C'est le geste « j'offre un mois », traçable et non réutilisable deux fois par le même compte.

**4. Messages** — la boîte de réception du formulaire de contact du site : date, expéditeur, société, sujet, message, et trois boutons (lu / répondu / archivé). Une pastille indique les non lus.

**5. Paiements** — les 50 derniers mouvements (date, société, palier, montant, statut, référence Paddle), les encaissements du mois, et la liste des comptes actifs **sans aucun paiement** (activés par code promo ou à la main). Tant que Paddle live n'existe pas, l'écran affichera honnêtement *« aucun encaissement enregistré »* — pas un zéro déguisé en résultat.

**6. Annonces** — recherche par titre, vendeur ou identifiant, et un bouton **Retirer du catalogue / Remettre en ligne** avec motif obligatoire. Une annonce retirée disparaît réellement du site public (pas seulement de l'affichage) ; son vendeur continue de la voir, avec le motif.

---

## 5. La fondation technique

### Ce qu'on pose en base

| Brique | Rôle | Règle de sécurité |
|---|---|---|
| Table `platform_admins` | La liste des administrateurs de MineGrid (compte, rôle, date, qui a accordé, date de révocation, exigence de double authentification) | **Aucun droit d'accès pour les comptes clients** — pas même la lecture. La liste des administrateurs est en soi une information sensible. |
| Fonction `is_platform_admin()` | La seule autorité : « la personne qui appelle est-elle administrateur, aujourd'hui ? » | Aucun paramètre : l'identité vient toujours de la session, jamais du navigateur. Une révocation prend effet **immédiatement**. |
| Table `platform_admin_audit` | Le journal : qui, quand, quoi, sur qui, pourquoi | **Impossible à modifier ou effacer, même par un outil d'administration**, grâce à un verrou posé dans la base elle-même (même technique que les verrous de juillet sur les commissions et les paiements). |
| Une fonction serveur par geste (lister les abonnés, prolonger, créer un code…) | Le seul chemin d'accès aux données | Chaque fonction revérifie l'identité côté serveur, **ne renvoie que les colonnes nécessaires**, et écrit sa ligne de journal dans la même opération. |
| Écran de garde `RequirePlatformAdmin` côté site | Confort d'affichage | Écrit **spécialement** pour la console : composant neuf, refus par défaut (pendant le chargement, en cas d'erreur réseau, sans session). Les gardes existantes ne sont **pas** réutilisées — l'une accepte un code d'accès sans compte, l'autre est volontairement permissive en cas d'erreur. |

Le premier administrateur est créé **une seule fois, à la main**, dans l'éditeur SQL de Supabase. Aucun chemin dans l'application ne permet de se nommer administrateur ni de s'élever soi-même : une fonction refuse toute action d'un administrateur sur son propre accès, et un verrou en base bloque la manœuvre même en cas de bug futur. Le dernier administrateur actif ne peut pas être retiré (sinon la plateforme se verrouille).

**La clé technique « toute-puissante » de Supabase n'entre jamais dans le site** : la console reste une page web normale adossée à des fonctions serveur contrôlées.

### Ce qui sera prouvé en local (Docker) avant toute mise en production

Le projet dispose déjà d'un banc d'essai qui rejoue chaque règle de sécurité sur une base jetable (`supabase/tests/run_all_proofs.sh`, 19 harnais, exécuté aussi automatiquement). On y ajoute trois harnais, soit **15 contre-cas** :

| # | Ce qu'on prouve |
|---|---|
| 1 | Avant correctif : un pirate s'ajoute bien propriétaire d'une société étrangère et lit ses données **(on prouve d'abord que la faille existe)** |
| 2 | Après correctif : la même tentative échoue |
| 3 | Une invitation légitime continue de fonctionner (rien n'est cassé) |
| 4 | Un client ordinaire ne peut ni lire ni écrire la liste des administrateurs |
| 5 | Un administrateur **révoqué** perd tous ses droits immédiatement |
| 6 | Un administrateur « support » ne peut pas nommer d'administrateur |
| 7 | Un administrateur ne peut pas s'élever lui-même |
| 8 | Le verrou en base bloque l'auto-nomination même par une voie détournée |
| 9 | On ne peut pas retirer le dernier administrateur |
| 10 | Une fausse table homonyme ne trompe pas le contrôle d'identité |
| 11 | Si la double authentification est exigée, une session simple est refusée |
| 12 | Un administrateur n'a **aucun abonnement** : il n'apparaît pas dans le chiffre d'affaires |
| 13 | Le journal ne peut être ni modifié ni effacé, **même avec les droits les plus élevés** |
| 14 | Chaque geste d'administration produit exactement une ligne de journal, et un motif vide est refusé |
| 15 | **Non-régression** : les 19 harnais existants (isolation entre sociétés) passent toujours à l'identique avec la fondation en place |

Plus, pour le Lot 5 : un visiteur non connecté ne voit plus l'annonce retirée, et son vendeur ne peut pas la remettre en ligne tout seul.

---

## 6. Points de vigilance

**Sécurité**
- Un compte administrateur voit tous les abonnés : c'est la cible la plus rentable de la plateforme. D'où la révocation immédiate, le journal infalsifiable et la question de la double authentification (décision D4).
- Les écrans ne servent à rien comme protection : **c'est le serveur qui refuse**. Chaque fonction revérifie l'identité, y compris si quelqu'un contourne le menu.
- Trois « accès internes » cohabitent aujourd'hui dans le code, tous fondés sur une variable de compilation (radar, espace de démonstration, code d'accès temporaire) : aucun n'est révocable ni tracé. Ils seront ramenés sous le compte administrateur, mais **après** l'ouverture.

**RGPD** (clients professionnels marocains et africains)
- Périmètre proposé — **visible** : identité du titulaire, société, palier, statut, échéance, sièges, annonces (déjà publiques), métadonnées de paiement, compteurs.
- **Jamais visible**, même pour l'administrateur principal : contenu des messages privés entre clients, documents et fichiers déposés, contenu des espaces appels d'offres, devis, dossiers de financement, et **clés d'API des clients** (la seule action admissible sur celles-ci est la suppression).
- Toute **consultation** d'une fiche client individuelle est journalisée, pas seulement les modifications.
- À faire suivre : une phrase dans la politique de confidentialité du site indiquant que le personnel MineGrid peut accéder aux données de compte pour l'assistance, avec journalisation ; et une durée de conservation du journal (proposition : 24 mois).

**Trois pièges de chiffres à ne pas rater** (ils feraient afficher des montants faux dès le premier jour)
1. **Les noms de paliers sont croisés en base** : le code `pro` correspond au plan affiché « Premium » (20 $) et `premium` au plan affiché « Pro » (50 $). Tout affichage passe par la fonction officielle du projet — sinon le tableau des abonnés est inversé et le chiffre d'affaires faux d'un facteur 2,5.
2. **Les montants Paddle sont enregistrés en centimes** dans une colonne qui ressemble à des dollars : un abonnement à 20 $ y figure « 2000,00 ». À corriger avant d'afficher le premier montant.
3. **Rien ne balaye les abonnements expirés** : le statut reste « actif » après l'échéance. Un compteur « abonnés actifs » naïf surévaluera la base ; il faut toujours croiser statut **et** date de fin.

---

## 7. Décisions à trancher

| # | Question | Recommandation par défaut |
|---|---|---|
| **D1** | **Ferme-t-on la faille C1 en production tout de suite**, avant même la console ? C'est une écriture dans la base de production. | **Oui, cette semaine.** Vérifié : aucun écran du site n'utilise ce chemin, la fermeture ne casse rien, et la preuve locale sera faite avant. |
| **D2** | **Quel compte est administrateur** : un compte dédié (`admin@minegrid.ma`) ou votre compte actuel `t.ainour@minegrid.ma` ? | **Un compte dédié.** Mélanger les deux rend le journal illisible et vous fait naviguer tous les jours avec un accès total. |
| **D3** | **« Offrir un mois » : code promo ou prolongation directe en base ?** | **Code promo** (traçable, non réutilisable, non écrasé par Paddle). Prolongation directe réservée aux comptes **non** facturés par Paddle. |
| **D4** | **Double authentification obligatoire** sur les comptes administrateurs dès la mise en service ? (Il faut installer une application d'authentification sur votre téléphone.) | **Oui dès la mise en service.** La colonne existe dès le Lot 1 ; l'activation se fait après avoir vérifié que vous pouvez bien vous connecter, pour éviter tout risque de vous enfermer dehors. |
| **D5** | **Jusqu'où l'administrateur voit-il les données des clients ?** | **Le périmètre restreint du § 6** : identité, abonnement, annonces, compteurs — **pas** les messages privés ni les documents. Si un dépannage l'exige un jour, on ajoutera un accès « assistance » autorisé par le client lui-même et limité à 72 heures (repoussé en P1). |

---

## 8. Effort par lot

Unité : **séance** ≈ une demi-journée de travail, spec incluse, **preuves comprises** (la règle maison : une étape sans preuves n'est pas livrée).

| Lot | Contenu | Séances | Preuves produites |
|---|---|---:|---|
| **0** | Fermeture de la faille C1 + création automatique de la société à l'activation | **2–3** | 2 harnais Docker (contre-cas 1 à 3) + vérification qu'une invitation fonctionne toujours |
| **1** | Fondation : table, contrôle d'identité, journal, garde du site, coquille de la console `#admin` | **3–4** | 1 harnais de 12 contre-cas + rejeu des 19 harnais existants |
| **2** | Écran Abonnés + fiche client + 4 gestes de dépannage | **3–4** | Contre-cas « un client ne peut appeler aucune de ces fonctions » + capture d'écran sur données réelles |
| **3** | Codes promo + boîte de réception Contact | **2–3** | Création d'un code réel, utilisation par un compte de test, message de contact lu bout en bout |
| **4** | Registre des paiements (webhook) + correction des montants en centimes + écran Paiements | **2–3** | Rejeu d'un paiement Paddle en bac à sable : la ligne de registre apparaît avec le bon montant |
| **5** | Retirer une annonce du catalogue | **2–3** | Contre-cas : le visiteur non connecté ne voit plus l'annonce ; le vendeur ne peut pas la remettre seul |
| | **Total v1** | **14–20 séances** (≈ 7 à 10 jours de travail effectif) | |

**Ordre proposé** : 0 → 1 → 2 → 3 → 4 → 5. Les lots 0 et 1 sont indissociables ; à partir du lot 2, chaque lot est utilisable dès qu'il est livré. Le lot 5 peut passer devant le 4 si Paddle live tarde (bloquant B2).

**Dépendances externes** (hors de portée de l'assistant) : le bloquant **B1** (site en ligne cassé) doit être levé pour que la console soit utilisable en production ; le bloquant **B2** (compte Paddle live) conditionne le contenu — pas la construction — de l'écran Paiements.