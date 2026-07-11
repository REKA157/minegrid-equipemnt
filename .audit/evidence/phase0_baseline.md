# PREUVE — Phase 0 baseline

ID DE PREUVE : EV-P0-001
DATE : 2026-07-11
BRANCHE : fix/audit-remediation
COMMIT : f4fa30f55941edd00383378502edbda4300e0cef
ENVIRONNEMENT : poste local Windows (dépôt uniquement ; pas de prod/staging)
COMMANDES : git status/branch/rev-parse/log/remote ; node -v ; npm -v ; git ls-files ; grep d'inventaire

## Git
- branche : `fix/audit-remediation`
- HEAD : `f4fa30f5`
- working tree : propre (0 modifié)
- remotes : `origin` = https://github.com/REKA157/minegrid-equipemnt.git (PUBLIC), `old-origin` idem RIK488
- node v22.20.0 / npm 10.9.3

## Inventaire (comptages)
- Migrations versionnées : **20** (`supabase/migrations/*.sql`)
- Harnais de test SQL locaux : **26** (`supabase/tests/*.sql`)
- Edge Functions : **14 fichiers** sous `supabase/functions/` (ai-proxy, create-payment, escrow-webhook,
  exchange-rates, recompute-trust-score, send-contact-email, send-email, stripe-webhook, tenders-ai)
- Scripts SQL manuels : **44** (`sql/*.sql`, incl. `sql/nextgen/`)
- Routes hash (App.tsx) : **56** (dont 8 dashboards métier `dashboard-*-display`)
- `create policy` : 37 (migrations) + 298 (sql/) · `enable row level security` : 11 + 95
- Fonctions `security definer` (migrations) : 46
- Fichiers de test Vitest : **65**
- CI : `.github/workflows/ci.yml` (tsc --noEmit → lint → vitest → build → bundle size) + `agent-quality.yml`

## Variables d'environnement attendues (.env.example — noms uniquement)
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_STRIPE_PUBLISHABLE_KEY, VITE_MONITOR_API_URL,
VITE_MONITOR_ADMIN_TOKEN, VITE_MONITOR_TEMP_ACCESS_CODE, VITE_CONTACT_RECEIVER_EMAIL,
VITE_WHATSAPP_NUMBER, VITE_PROMO_CODE, VITE_PRODUCTION_URL.
(Aucune valeur de secret lue ni reproduite.)

## Observations à instruire aux phases suivantes (PAS des conclusions)
1. La CI utilise des identifiants Supabase factices et **ne teste pas la RLS** (Docker/SQL) ni l'E2E →
   la sécurité multi-tenant n'est pas couverte par le pipeline (à instruire en Phase 6).
2. La **majorité** des policies RLS vit dans `sql/` (scripts « à exécuter à la main »), pas en migrations
   versionnées → risque de **dérive/absence** en prod (à instruire en Phase 2 + parité d'environnements).
3. Modules financiers réels (Stripe, escrow, commissions) → cibles P0 prioritaires (Phase 2 + fraude).

ÉLÉMENTS QUI INVALIDERAIENT CETTE PREUVE : changement de commit/branche, ajout/retrait de migration,
modification du CI, modification de `.env.example`.
