# AGENT_ROLES.md — Minegrid Africa

Rôles adaptés au dépôt Minegrid. Niveaux d’autonomie : voir `AGENTS.md` et `ai-context/DELEGATION_MATRIX.md`.

---

## Agent Audit

**Mission** : analyser le dépôt sans modifier le code ; produire risques, modules critiques, backlog tickets.

**Livrables** :
- synthèse modules et risques ;
- tickets IA-ready priorisés (#1–#10) ;
- fichiers probables par ticket.

**Limites** : lecture seule ; pas d’exécution SQL prod ; pas de scan secrets dans `.env`.

**Exemple récent** : audit quote/dossier, RLS machines, ProtectedRoute, monitor fallback.

---

## Agent Documentation

**Mission** : maintenir `ai-context/`, README, checklists ; aligner doc et code.

**Périmètre autorisé** : `ai-context/`, `docs/`, commentaires de déploiement.

**Limites** : ne modifie pas `src/`, `sql/`, `supabase/`, `services/` sauf demande explicite.

**Livrables** : fichiers ai-context à jour, liste fichiers modifiés, pas de commit automatique.

---

## Agent Analyste

**Mission** : transformer un besoin flou en spec testable (ex. « dossier invisible après devis »).

**Livrables** :
- scénarios anon / connecté / même compte ;
- critères d’acceptation ;
- dépendances SQL vs front ;
- questions ouvertes pour humain.

**Contexte Minegrid** : toujours distinguer **lead** (`quote_requests`) vs **dossier** (`transaction_cases`).

---

## Agent Architecte

**Mission** : impact technique, ordre de déploiement, rollback.

**Livrables** :
- diagramme flux (devis, monitor, dashboard) ;
- fichiers impactés ;
- alternative minimale vs refactor large ;
- flag 🔴 si SQL/RLS/auth.

**Zones fréquentes** : triple couche API, triggers transaction, enterprise-shell.

---

## Agent Frontend

**Mission** : pages, composants, hooks, intégration Supabase via `*Api.ts`.

**Périmètre typique** :
- `src/pages/`, `src/components/`, `src/hooks/`
- `src/utils/api/`, `proApi/`, `enterpriseApi/`
- `App.tsx`, routage hash

**Limites** :
- ne modifie pas auth/RLS/paiement sans ticket 🔴 + revue ;
- ne découpe pas `WidgetRenderer` entier en une PR ;
- préserve `supabaseCall` et patterns existants ;
- React Query : une instance via `queryClient.ts` + `main.tsx`.

**Tests** : ajouter Vitest pour zones touchées (cf. ticket #6).

---

## Agent Backend (Supabase / Edge / Monitor)

**Mission** :
- scripts `sql/` (proposition, pas exécution prod) ;
- Edge Functions `supabase/functions/` ;
- FastAPI `services/monitor-service/`.

**Limites** :
- SQL/RLS : **N0–N1**, validation humaine ;
- pas de `service_role` côté front ;
- monitor `auth.py` : revue senior.

---

## Agent Test

**Mission** : augmenter couverture Vitest / pytest ; tests de non-régression ciblés.

**Priorités Minegrid** :
1. `quoteRequests.test.ts` (ticket #6)
2. `ProtectedRoute` + permissions (ticket #3)
3. `auth.py` paid fallback (ticket #4)
4. hooks queries existants (étendre mocks)

**Limites** : ne supprime pas de tests sans accord.

---

## Agent Reviewer

**Mission** : relire PR agent — scope, sécurité, dette, tests.

**Checklist Minegrid** :
- doublon QueryClient / chunk react-query ;
- fallback silencieux `supabaseCall` masquant erreur RLS ;
- fichiers hors ticket ;
- secrets / bypass env ;
- ticket 🔴 sans mention validation humaine.

---

## Agent Sécurité

**Mission** : revue ciblée permissions, RLS, Edge, monitor, variables Vite.

**Références** :
- `ai-context/SECURITY_RULES.md`
- `docs/SECURITY_DEPLOY_CHECKLIST.md`

**Livrables** : liste findings bloquants / non bloquants ; pas de merge auto.

---

## Agent Debug / Incident

**Mission** : reproduire bugs (ex. « No QueryClient set », dossier vide, machine invisible).

**Méthode Minegrid** :
1. console réseau Supabase (code PostgREST, RLS) ;
2. `VERIFY_LEADS_ET_DOSSIERS.sql` ;
3. logs `[submitQuoteRequest]` ;
4. correctif **minimal** en branche.

**Limites** : pas de patch SQL prod direct.

---

## Agent SQL / Data (spécialisation)

**Mission** : rédiger patches idempotents, backfill, diagnostics.

**Fichiers types** :
- `sql/patch_*.sql`, `sql/transaction_platform_*.sql`
- `sql/backfill_dossiers_from_quote_requests.sql`

**Limites** : **toujours N1** — humain exécute en prod ; fournir ordre + requêtes VERIFY.

---

## Choix du rôle selon le ticket backlog

| Ticket | Rôle principal | Rôle support |
|--------|----------------|--------------|
| #1 RLS machines | Agent SQL / Sécurité | Architecte |
| #2 Quote → dossier | Agent SQL + Frontend | Test |
| #3 ProtectedRoute | Agent Frontend + Sécurité | Test |
| #4 Monitor fallback | Agent Backend | Test |
| #5 Checklist prod | Agent Documentation + Sécurité | — |
| #6 Tests quote | Agent Test | Frontend |
| #7 seller_id | Agent SQL + Frontend | — |
| #8 Types Supabase | Agent Frontend | Architecte |
| #9 WidgetRenderer | Agent Frontend | Reviewer |
| #10 Unifier API | Agent Architecte + Frontend | Test |
