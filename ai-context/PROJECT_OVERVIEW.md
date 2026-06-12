# PROJECT_OVERVIEW.md — Minegrid Africa

## Nom du projet

**Minegrid Africa** (`minegrid-africa`) — plateforme web d’achat, vente, location et services autour des équipements miniers et BTP en Afrique.

## Vision produit

Minegrid met en relation acheteurs, vendeurs et acteurs métiers (loueur, transporteur, transitaire, logisticien, mécanicien, courtier, investisseur) autour du catalogue de machines et de flux transactionnels.

Le front public permet de parcourir les annonces, demander un devis, s’inscrire et accéder à des espaces Pro / Entreprise configurables (dashboards par widgets).

Un **socle dossier transaction** (`transaction_cases`) relie progressivement devis, leads, participants et modules métier. Le **Global Monitor** (service FastAPI séparé) couvre l’intelligence marché (projets, alertes, ingestion).

## Utilisateurs

| Profil | Description |
|--------|-------------|
| **Visiteur / acheteur** | Parcourt le catalogue, envoie une demande de devis (lead même sans compte ; dossier si connecté). |
| **Vendeur / loueur** | Publie et gère des annonces, reçoit leads et dossiers, dashboards entreprise. |
| **Client Pro** | Abonnement, paiement Stripe, espace Pro. |
| **Acteurs métiers** | Dashboards dédiés (transport, logistique, courtage, etc.) via shell entreprise. |
| **Administrateur / ops** | Sources monitor, configuration, scripts SQL (hors scope agent auto en prod). |

## Problème résolu

- Centraliser la découverte et la transaction d’équipements lourds en Afrique.
- Donner aux professionnels un tableau de bord unifié (pipeline, stock, locations, etc.).
- Relier demandes de prix, leads CRM et dossiers transaction pour un suivi bout-en-bout.

## Modules critiques (état audit)

| Module | Rôle | Emplacement principal |
|--------|------|---------------------|
| Auth & session | Supabase Auth, contexte React | `src/contexts/AuthContext.tsx` |
| Garde routes | Session (+ code temporaire monitor) | `src/components/ProtectedRoute.tsx` |
| Catalogue machines | Annonces, fiches, vendeur | `src/pages/Machines.tsx`, `MachineDetail.tsx` |
| Leads / devis | `quote_requests`, inbox vendeur | `src/utils/api/quoteRequests.ts`, `LeadsInbox.tsx` |
| Dossiers transaction | `transaction_cases`, participants | `src/utils/api/transactionCases.ts`, SQL `transaction_platform_*` |
| Dashboards entreprise | Shell multi-métiers, widgets | `src/pages/enterprise-shell/`, `WidgetRenderer.tsx` |
| Paiement | Stripe via Edge Functions | `supabase/functions/create-payment/` |
| Global Monitor | FastAPI, JWT, abonnement | `services/monitor-service/`, `GlobalMonitor.tsx` |
| Données Supabase | Client + RLS | `src/utils/supabaseClient.ts`, `sql/` |

## Risques principaux (synthèse audit)

1. **RLS `machines`** — policies historiques trop permissives dans `archive/scripts/sql/` ; colonnes vendeur hétérogènes (`sellerid`, `seller_id`, `user_id`, `owner_id`).
2. **`ProtectedRoute`** — contrôle session uniquement, pas de rôle : leads/dossiers/admin accessibles à tout compte connecté si RLS insuffisant.
3. **Flux quote → dossier** — trigger SQL strict, incohérences `seller_id` → leads OK mais dossiers vides.
4. **Monitor paid fallback** — accès payant accordé si table `pro_clients` absente (`auth.py`).
5. **Bypass démo prod** — `VITE_MONITOR_TEMP_ACCESS_CODE`, `VITE_PROMO_CODE` côté front.
6. **Dette UI** — monolithes (`WidgetRenderer.tsx`, `Dashboard.jsx`).
7. **Typage faible** — `supabaseClient` en `any`, `strict: false`.
8. **Couverture tests** — 9 tests Vitest front ; auth, paiement, quote/transaction non testés.

## Objectifs prioritaires

1. Fiabiliser **quote → dossier transaction** (SQL + front + tests).
2. Durcir **accès et RLS** (machines, routes protégées, monitor).
3. Réduire la dette sur dashboards et couche API sans casser l’existant.

## Non-objectifs (agents IA)

- Modifier la base **production** Supabase sans validation humaine.
- Changer auth, paiement ou policies RLS en autonomie.
- Réécrire entièrement les dashboards legacy en une seule PR.
- Exposer secrets, mots de passe ou clés service role.

## Contraintes métier

- **Multi-métiers** : 8+ rôles entreprise avec widgets configurables.
- **Devises** : affichage MAD / taux de change (`useExchangeRates`).
- **Session Supabase** : une session par origine navigateur ; dossier auto seulement si acheteur connecté et vendeur résolu.
- **Sécurité** : checklist `docs/SECURITY_DEPLOY_CHECKLIST.md` avant release.
- **Données sensibles** : emails acheteurs, JWT, clés Stripe/Resend, service role monitor.

## Backlog technique prioritaire (10 tickets IA-ready)

> **Validation humaine obligatoire** pour tickets marqués 🔴 (SQL, RLS, auth, paiement, prod).

| # | Ticket | Risque | Difficulté |
|---|--------|--------|------------|
| 1 | 🔴 Durcir RLS `machines` (lecture publique + CRUD propriétaire) | Critique | Élevée |
| 2 | 🔴 Flux quote → dossier : patch trigger + RPC + participants | Élevé | Moyenne |
| 3 | 🔴 Renforcer `ProtectedRoute` avec rôles / permissions | Critique | Moyenne |
| 4 | 🔴 Supprimer fallback paid access monitor si `pro_clients` absent | Élevé | Faible |
| 5 | Checklist prod : bypass/promo vides | Élevé | Faible |
| 6 | Tests automatisés `submitQuoteRequest` | Élevé | Moyenne |
| 7 | Normaliser colonne vendeur machines (`seller_id` canonique) | Moyen | Moyenne |
| 8 | Générer types Supabase, retirer `any` client | Moyen | Élevée |
| 9 | Découper `WidgetRenderer.tsx` | Moyen | Élevée |
| 10 | Unifier couche API (`api` / `proApi` / `enterpriseApi`) | Moyen | Élevée |

Ordre recommandé agent : **6 → 4 → 5 → 2 (doc) → 3 → 7 → 1 → 8 → 9 → 10**.

## Définition du succès

Le projet est sur la bonne trajectoire si :

- Une demande de devis **acheteur connecté** sur annonce **d’un autre vendeur** crée un **dossier** visible vendeur + acheteur.
- Les routes sensibles (`admin-sources`, `leads`) respectent rôles **et** RLS.
- `npm run build`, `npm run test`, `npm run lint` passent sur chaque PR agent.
- Aucun secret ni bypass démo actif en production.
- La documentation `ai-context/` reste alignée avec le code après changements majeurs.
