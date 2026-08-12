# ETAT — MineGrid Équipement

> Tableau de bord du projet. **À lire en début de session, à mettre à jour avant chaque commit.**
> Dernière mise à jour : **2026-08-03**

---

## Où on en est

Le **socle technique est sain** (sécurité auditée, abonnements prouvés de bout en bout, catalogue,
appels d'offres, radar). Ce qui manque est **opérationnel** : le site en ligne est cassé, on ne peut
pas encore encaisser, et il n'existe aucun outil d'administration.

**Verdict production : PAS PRÊT** — 3 bloquants ci-dessous.

---

## 🚨 Bloqués sur (action requise, hors de portée de l'assistant)

| # | Bloquant | Qui | Détail |
|---|---|---|---|
| B1 | **Site en ligne cassé** : le bundle déployé appelle une base Supabase **supprimée** (`gvbtydxkvuwrxawkxiyv`) → aucune connexion possible pour personne | Patron | Correctif prêt : `minegrid-site.zip` (vérifié 6 points) à téléverser dans `public_html` (Hostinger) |
| B2 | **Aucun encaissement possible** : Paddle n'existe qu'en bac à sable | Patron | Ouvrir un compte **Paddle live** (vérification société, registre de commerce). Délai externe : plusieurs jours |
| B3 | **Aucune console d'administration** | Assistant | Spec en cours de rédaction → validation → implémentation |

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

## Prochaine action

1. **Patron** : téléverser `minegrid-site.zip` (débloque tout le reste) puis déployer `tenders-ai`.
2. **Assistant** : livrer la spec de la console d'administration → validation → implémentation.
