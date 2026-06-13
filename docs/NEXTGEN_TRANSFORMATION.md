# MineGrid NextGen — De la marketplace à l'infrastructure de confiance

> **Thèse.** MineGrid ne doit pas être « un site d'annonces d'engins » (un marché déjà
> occupé par Via Mobilis/Mascus, et perdant — cf. Tradus/OLX fermé en 2021). MineGrid
> doit être **l'infrastructure transactionnelle et de confiance des équipements lourds
> en Afrique francophone** : inspection, séquestre, financement, logistique, données
> propriétaires. C'est le seul fossé défendable — il exige des opérations au sol qu'un
> acteur SEO européen ne montera pas, et il résout le vrai problème terrain : **la
> confiance** (le canal informel WhatsApp est massif mais sans recours).
>
> Ce document est la colonne vertébrale ; chaque module a son dossier dédié
> (`TRUST_LAYER.md`, `INSPECTION.md`, `ESCROW.md`, `FINANCE.md`, `LOGISTICS.md`,
> `MARKET_INTELLIGENCE.md`, `DATA_PLATFORM.md`, `AI_STRATEGY.md`).

---

## 0. Ce qui change vs l'audit

L'audit (`docs/AUDIT_STRATEGIQUE_2026.md`) a noté **34/100** et bien évalué l'état du
code, la sécurité et la dette. Il a **sous-évalué les actifs futurs** : données
propriétaires, effets réseau, services financiers, intelligence marché, IA métier,
inspection, confiance. NextGen matérialise ces actifs. Objectif : **score investisseur
> 75/100** une fois le socle opérationnel et un pilote corridor lancé.

**Repositionnement (Phase 2)** — la navigation et les parcours passent de « Catalogue /
Annonces » à **« Acheter en confiance / Vendre en confiance / Services »** :
- Acheteur : *Trouver → Inspecter → Séquestrer → Financer → Livrer*.
- Vendeur : *Lister → Se faire vérifier (badge) → Recevoir des leads qualifiés → Vendre sécurisé*.
- Pro/Entreprise : *Veille marché + dashboards métier* (déjà gardés par abonnement serveur).

---

## 1. Architecture cible

```
                 ┌─────────────────────────────────────────────┐
   Front React   │  Acheter en confiance · Vendre · Services    │
   (Vite+SSR*)   │  TrustBadge · Inspection · Escrow · Finance  │
                 └───────────────┬─────────────────────────────┘
                                 │  (RLS stricte, lecture/soumission)
                 ┌───────────────▼─────────────────────────────┐
   Supabase      │  Postgres + RLS  +  Edge Functions (Deno)    │
                 │  trust_profiles, verifications,               │
                 │  inspection_*, escrow_*, finance_*,           │
                 │  logistics_*, market_*, price_observations,   │
                 │  platform_events, ai_predictions              │
                 └───────────────┬─────────────────────────────┘
                                 │  service_role (écritures sensibles)
        ┌────────────────────────┼───────────────────────────┐
   Edge Functions           Workers/Cron                Partenaires
   (paiement, webhook        (scoring, recalcul          (PSP escrow,
    escrow PSP, scoring       trust_score, ingestion      banques, transit,
    finance, estimation)      monitor, alertes)           inspecteurs)
```
\* SSR/prerender introduit en Phase 11 pour le SEO ; l'app reste la même base React.

**Principe de sécurité hérité de l'audit** : aucune écriture « sensible » (score de
confiance, certification d'inspection, état de séquestre, scoring/octroi financement)
n'est faite par le client. Le client **lit** et **soumet des demandes** ; le serveur
(`service_role` + Edge Functions à signature vérifiée) **décide et écrit**. C'est le
même patron que le correctif paiement (webhook Stripe + RLS) de la remédiation Phase 1.

---

## 2. Modèle de données NextGen (migrations `sql/nextgen/`)

| Migration | Domaine | Tables clés |
|---|---|---|
| `0001_trust_and_inspection.sql` | Trust + Inspection | `trust_profiles`, `verifications`, `machine_history`, `inspectors`, `inspection_requests`, `inspection_reports`, `inspection_media` |
| `0002_escrow_and_finance.sql` | Escrow + Finance | `escrow_transactions`, `escrow_events`, `finance_partners`, `finance_applications` |
| `0003_logistics_intelligence_data.sql` | Logistics + Intelligence + Data | `logistics_quotes`, `customs_cases`, `market_projects`, `market_alerts`, `price_observations`, `platform_events`, `ai_predictions` |

Toutes idempotentes, RLS activée, écritures sensibles `revoke`d aux rôles client.

---

## 3. Les 8 actifs stratégiques (et pourquoi un investisseur paie)

1. **Confiance (Trust Layer)** — badge vérifié + score auditable. *Moat : opérations de vérification, pas du logiciel.*
2. **Inspection** — rapports certifiés (le produit qui a créé IronPlanet). *Moat : réseau d'inspecteurs au sol.*
3. **Escrow** — séquestre conditionné inspection+livraison. *Moat : confiance transactionnelle + rétention on-platform (anti-désintermédiation).*
4. **Finance** — apporteur d'affaires vers banques (jamais de float). *Moat : dossiers scorés + relation partenaires ; adresse le gap de 100-120 Md$/an.*
5. **Logistique** — devis transport + dédouanement (hub Tanger Med). *Moat : capture du post-match.*
6. **Market Intelligence** — projets/appels d'offres miniers & BTP (réservé aux abonnés). *Moat : ingestion + fraîcheur + ciblage.*
7. **Data Platform** — prix d'occasion observés, historique machine/vendeur. *Moat : actif propriétaire qui s'auto-renforce (effet de données).*
8. **IA métier** — estimation prix, détection fraude, scoring, matching. *Moat : modèles entraînés sur la data propriétaire ci-dessus.*

**Boucle d'effet réseau & données :** chaque transaction (inspection, vente, escrow)
émet des `platform_events` et des `price_observations` → enrichit la Data Platform →
améliore l'estimation/scoring/fraude → meilleure confiance → plus de transactions.

---

## 4. Plan d'exécution (12 phases) et statut

| Phase | Objet | Statut NextGen |
|---|---|---|
| 1 | Corrections critiques (paiement, secrets, façades, RLS) | ✅ socle hérité de la remédiation (branche sécurité) ; à déployer |
| 2 | Repositionnement produit (navigation, parcours) | 📐 spécifié (ce doc) ; UI à implémenter |
| 3 | Trust Layer | ✅ schéma + code (`computeTrustScore`, `TrustBadge`, service) + tests ; UI à étendre |
| 4 | Inspection | ✅ schéma + workflow ; UI/Edge à implémenter (`INSPECTION.md`) |
| 5 | Escrow | ✅ schéma + workflow ; intégration PSP à brancher (`ESCROW.md`) |
| 6 | Finance | ✅ schéma + scoring spec (`FINANCE.md`) |
| 7 | Logistique | ✅ schéma (`LOGISTICS.md`) |
| 8 | Market Intelligence | ✅ schéma + consomme le monitor-service existant (`MARKET_INTELLIGENCE.md`) |
| 9 | Data Platform | ✅ schéma `price_observations`/`platform_events` (`DATA_PLATFORM.md`) |
| 10 | IA à ROI élevé | 📐 spec data+archi par fonction (`AI_STRATEGY.md`) |
| 11 | SEO scale (SSR, pages pays/marque/modèle) | 📐 spécifié (voir §6) |
| 12 | Scalabilité (10k→1M) | 📐 spécifié (voir §7) |

Légende : ✅ socle réel livré (code/SQL/tests) · 📐 architecture spécifiée, implémentation progressive.
**Aucune façade** : ce qui est livré est testé ; ce qui est spécifié est explicitement marqué comme tel.

---

## 5. Honnêteté produit (règle anti-façade)

L'audit a montré que la cause d'échec n°1 du produit actuel était de **prétendre** des
fonctionnalités inexistantes. NextGen impose : tout module non encore opérationnel
affiche un état « bientôt disponible » honnête (pas de succès simulé, pas de données
`Math.random`, pas d'« IA » factice). Un module n'est « actif » que lorsque son workflow
serveur est réellement branché.

---

## 6. SEO industriel (Phase 11)

Migration du routing hash → **path-based + SSR/prerender** (vite-plugin-ssr ou Next.js).
Pages programmatiques générées depuis la base : `/{pays}/{categorie}/{marque}/{modele}`
(ex. `/senegal/pelles/caterpillar/320d`), pages vendeur vérifié, pages projet marché.
Sitemap généré, JSON-LD `Product`/`Offer`/`Organization`, hreflang fr (+ en/pt en Phase
suivante). Chaque annonce réelle = une page d'acquisition (le canal du secteur).

---

## 7. Scalabilité (Phase 12)

- **Données** : filtres en SQL (index `brand/year/price/country`), agrégations en RPC/vues
  matérialisées, `price_observations` partitionnée par mois au-delà de ~10 M lignes.
- **Lecture** : cache CDN des pages SSR + React Query côté client ; `trust_score` et
  estimations pré-calculées (pas à la volée).
- **Écritures sensibles** : Edge Functions idempotentes + file d'événements
  (`platform_events`) pour découpler ingestion/scoring.
- **Monitor** : passer d'APScheduler in-process à des workers + cron déclenché, healthcheck
  profond, observabilité (Sentry/Plausible/uptime) — dette identifiée à l'audit.
- Cibles : 10k users (Supabase Pro suffit) → 100k (read replicas, CDN, RPC) → 1M
  (partitionnement, cache agressif, séparation lecture/écriture).

---

## 8. Trajectoire du score investisseur

| Jalon | Score visé | Déclencheur |
|---|---|---|
| Aujourd'hui (audit) | 34/100 | Pré-lancement, façades, paiement contournable |
| Sécurité déployée (remédiation) | ~40/100 | Verrou paiement armé + secrets rotés |
| Socle NextGen + repositionnement | ~50-55/100 | Trust/Inspection/Escrow opérationnels, narratif infra |
| Pilote corridor (Dakar ou Abidjan) | ~65-70/100 | 50-100 vendeurs vérifiés, 1ʳᵉˢ inspections+escrow réels |
| Traction + données propriétaires | **>75/100** | GMV réel, rétention M12 ≥30 %, estimation prix entraînée sur data maison |

**Ce que NextGen prouve à un investisseur :** non pas « un autre listing », mais une
**infrastructure** avec actifs composables (confiance → inspection → escrow → finance →
logistique → data → IA), un moat opérationnel, et une boucle de données qui se renforce.
