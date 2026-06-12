# QUALITY_GATES.md — Minegrid Africa

Référence complémentaire : `AGENTS.md` (format de sortie agent), `ai-context/TEST_COMMANDS.md`.

## Gates obligatoires avant merge (toute PR)

- [ ] `npm run build` — succès (tsc + vite build).
- [ ] `npm run test` — succès (Vitest, 9+ tests existants minimum).
- [ ] `npm run lint` — succès ou justification documentée des écarts.
- [ ] Revue humaine — obligatoire pour PR agent.
- [ ] Résumé technique au format `AGENTS.md`.
- [ ] Liste exacte des fichiers modifiés.
- [ ] Risques connus et limites de test.
- [ ] Aucun secret, `.env`, clé API ou mot de passe dans le diff.
- [ ] Branche dédiée — jamais push direct sur `main` / production.

## Gates par domaine Minegrid

### UI / composants (`src/components/`, `src/pages/`)

- [ ] Page(s) testée(s) listées (ex. `#machines`, `#dossiers`, dashboard métier).
- [ ] Responsive minimal vérifié (mobile + desktop).
- [ ] Aucun changement visuel hors scope ticket.
- [ ] Pas de régression sur Header / navigation hash.

### Flux devis & dossiers (`quoteRequests`, `transactionCases`, Leads)

- [ ] Comportement documenté : anon vs connecté vs même compte vendeur.
- [ ] Logs console / réseau vérifiés si liaison dossier.
- [ ] Si touché SQL : script idempotent + `VERIFY_LEADS_ET_DOSSIERS.sql` — **validation humaine 🔴**.

### Dashboards entreprise (`enterprise-shell/`, `WidgetRenderer`)

- [ ] Au moins un dashboard métier smoke-testé (vendeur ou loueur).
- [ ] Pas de régression chargement widgets (erreurs silencieuses `supabaseCall` fallback).
- [ ] Refactor WidgetRenderer : PR incrémentale, pas de big-bang.

### Supabase / SQL (`sql/`)

- [ ] 🔴 **Validation humaine senior obligatoire** avant exécution prod.
- [ ] Script idempotent (`create or replace`, `drop policy if exists`).
- [ ] Ordre d’exécution documenté dans le PR.
- [ ] Requêtes de contrôle fournies (ex. section A–E de `VERIFY_LEADS_ET_DOSSIERS.sql`).
- [ ] Aucune exécution agent directe sur prod.

### Edge Functions (`supabase/functions/`)

- [ ] Test local ou staging : JWT, CORS, rate limit.
- [ ] Checklist `docs/SECURITY_DEPLOY_CHECKLIST.md` sections 3–4.
- [ ] 🔴 Paiement / email : revue humaine.

### Monitor service (`services/monitor-service/`)

- [ ] `pytest` dans `services/monitor-service/tests/` si code Python modifié.
- [ ] Pas de fallback sécurité introduit sans ticket explicite.
- [ ] 🔴 Modification `auth.py` : revue humaine.

### Auth / permissions

- [ ] 🔴 **Interdit en autonomie agent** — proposition + revue senior.
- [ ] Tests manuels : compte non autorisé refusé sur routes sensibles.

### Paiement Stripe

- [ ] 🔴 Validation humaine obligatoire.
- [ ] Test : appel sans JWT → 401 ; avec JWT → clientSecret.

## Couverture tests actuelle (baseline audit)

| Zone | Tests existants | Gap |
|------|-----------------|-----|
| Utils (toast, logger, supabaseCall, router) | Oui | — |
| React Query hooks (messages, offers) | Partiel mock | — |
| `useShellState` | Oui | — |
| Auth, ProtectedRoute | Non | Ticket #3, #6 |
| quoteRequests / transactionCases | Non | Ticket #6 |
| Stripe / PaymentPage | Non | — |
| WidgetRenderer / dashboards | Non | Ticket #9 |
| monitor auth.py | Non | Ticket #4 |

**Règle** : une PR qui corrige un bug critique dans une zone non testée doit **ajouter au moins un test** ou documenter pourquoi impossible.

## Gates sécurité (renforcées Minegrid)

- [ ] `VITE_MONITOR_TEMP_ACCESS_CODE` vide en prod.
- [ ] `VITE_PROMO_CODE` vide si promos désactivées.
- [ ] RLS revue si table `machines`, `quote_requests`, `transaction_*` touchée.
- [ ] Pas de `service_role` exposé côté front.
- [ ] Rollback SQL / revert commit identifié.

## Gates documentation agent

- [ ] Mise à jour `ai-context/` si changement architecture, flux métier ou commandes test.
- [ ] Ticket backlog #1–10 mis à jour si résolu ou remplacé.

## Définition « PR incomplète »

Une PR agent est **incomplète** si :

- aucune commande test/build exécutée et résultat indiqué ;
- modification SQL sans script de vérification ;
- modification auth/RLS/paiement sans mention « validation humaine requise » ;
- scope dépassé (fichiers non liés au ticket).
