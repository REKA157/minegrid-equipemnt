# ETAT — MineGrid Équipement

> Tableau de bord du projet. **À lire en début de session, à mettre à jour avant chaque commit.**
> Dernière mise à jour : **2026-08-12**

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
| B3 | **Aucune console d'administration** | Assistant | Spec rédigée le 2026-08-12 (3 analyses parallèles) → à valider → implémentation |
| B4 | **Migration `p25` à appliquer** (sécurité + argent, voir ci-dessous) | Patron | Coller `.audit/APPLY_P25_ORG_HARDENING.sql` dans l'éditeur SQL Supabase — **prod ET staging** |

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

1. **Patron** : téléverser `minegrid-site.zip` (débloque tout le reste) puis déployer `tenders-ai`.
2. **Assistant** : livrer la spec de la console d'administration → validation → implémentation.
