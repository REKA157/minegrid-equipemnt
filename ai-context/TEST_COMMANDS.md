# TEST_COMMANDS.md — Minegrid Africa

Commandes validées depuis la racine du dépôt (`minegrid-africa`).

## Prérequis

```bash
npm install
```

Variables front (fichier local non versionné) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc. — **ne jamais committer**.

---

## Frontend (Vite + React)

### Développement

```bash
npm run dev
```

Serveur local : http://localhost:5173/ (port défini dans `vite.config.ts`).

### Lint

```bash
npm run lint
```

ESLint 9 sur le projet (`eslint.config`).

### Tests unitaires (Vitest)

```bash
npm run test
```

Mode watch :

```bash
npm run test:watch
```

UI Vitest :

```bash
npm run test:ui
```

Couverture :

```bash
npm run test:coverage
```

**Config** : `vitest.config.ts` — `include: src/**/*.{test,spec}.{ts,tsx}`, environment `jsdom`, setup `src/test/setup.ts`.

**Tests existants (baseline)** :

- `src/utils/toast.test.ts`
- `src/utils/logger.test.ts`
- `src/utils/supabaseCall.test.ts`
- `src/utils/machineSearchSuggest.test.ts`
- `src/stores/currencyStore.test.ts`
- `src/router/hashRouter.test.ts`
- `src/router/Link.test.tsx`
- `src/hooks/queries/queries.test.tsx`
- `src/pages/enterprise-shell/useShellState.test.ts`

### Build production

```bash
npm run build
```

Enchaîne `tsc` puis `vite build` → sortie `dist/`.

### Preview build local

```bash
npm run preview
```

---

## Monitor service (Python / FastAPI)

Répertoire : `services/monitor-service/`

### Installation

```bash
cd services/monitor-service
pip install -r requirements.txt
```

### Tests pytest

```bash
cd services/monitor-service
pytest
```

Tests existants :

- `tests/test_fingerprint.py`
- `tests/test_alert_evaluator.py`
- `tests/test_rules_engine.py`
- `tests/test_ppi_parse.py`

### Démarrage Docker (intégration manuelle)

```bash
cd services/monitor-service
cp .env.example .env   # configurer — ne pas committer
docker-compose up --build
```

API : http://localhost:8000/docs

### Compile check Python (optionnel)

```bash
cd services/monitor-service
python -m compileall app
```

---

## Supabase Edge Functions (validation manuelle)

Depuis la racine, avec CLI Supabase configurée :

```bash
supabase functions deploy send-contact-email
supabase functions deploy create-payment
```

Checklist complète : `docs/SECURITY_DEPLOY_CHECKLIST.md`.

---

## SQL (validation manuelle — 🔴 humain uniquement)

**Ne pas exécuter par agent en production.**

Scripts de diagnostic (lecture) :

- `sql/VERIFY_LEADS_ET_DOSSIERS.sql`

Ordre déploiement dossiers transaction (référence) :

1. `sql/transaction_platform_core.sql`
2. `sql/patch_transaction_participants_insert_buyer.sql` (si extended non déployé)
3. `sql/quote_requests.sql` ou `sql/patch_quote_requests_and_leads.sql`
4. `sql/transaction_platform_links_and_triggers.sql` **ou** patches séparés trigger + RPC

---

## Matrice « quoi lancer selon le ticket »

| Type de changement | Commandes minimales |
|--------------------|---------------------|
| Composant / page React | `npm run lint` + `npm run test` + `npm run build` |
| Utilitaire `src/utils/` | `npm run test` (+ test ciblé si ajouté) |
| `WidgetRenderer` / dashboard | idem + smoke manuel dashboard métier |
| `quoteRequests` / transaction | `npm run test` + test manuel devis connecté |
| Python monitor | `pytest` dans `services/monitor-service/` |
| SQL / RLS | requêtes VERIFY + **validation humaine** — pas de gate auto |
| Edge Function | deploy staging + checklist sécurité section 4 |

---

## Validation manuelle UI (obligatoire si pas de test auto)

Documenter dans la PR :

| Champ | Exemple |
|-------|---------|
| Page testée | `#leads`, `#dossiers`, `#machines/<id>` |
| Navigateur | Chrome 124 |
| Comptes | vendeur X, acheteur Y |
| Attendu | dossier visible, colonne Dossier « Ouvrir » |
| Obtenu | … |

---

## Règle PR agent

Une PR **sans** au moins une des lignes suivantes est incomplète :

- `npm run test` → résultat indiqué
- `npm run build` → résultat indiqué
- `pytest` → si Python touché
- Procédure manuelle décrite → si UI/SQL/Edge
