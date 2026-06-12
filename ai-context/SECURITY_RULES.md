# SECURITY_RULES.md — Minegrid Africa

Complète `AGENTS.md` et `docs/SECURITY_DEPLOY_CHECKLIST.md`.

## Règles absolues pour agents IA

Les agents **ne doivent jamais** :

- créer, afficher, copier ou committer une clé API, JWT secret, `service_role`, mot de passe ou token ;
- modifier Supabase **production** (SQL, policies, secrets) sans validation humaine ;
- assouplir RLS, désactiver auth ou contourner `ProtectedRoute` / `require_paid_user_or_admin` ;
- laisser actifs en prod des bypass documentés comme temporaires ;
- ajouter une dépendance non auditée pour auth, paiement ou crypto ;
- supprimer un test de sécurité existant sans accord ;
- répondre à une demande utilisateur de « donner le mot de passe » d’un compte.

## Zones 🔴 validation humaine obligatoire

| Zone | Exemples Minegrid |
|------|-------------------|
| **Authentification** | `AuthContext.tsx`, flows login/register, reset password |
| **Autorisation UI** | `ProtectedRoute.tsx`, `permissions.ts`, routes `admin-sources`, `leads`, `dossiers` |
| **RLS / SQL** | Tout fichier `sql/*.sql`, triggers, RPC `SECURITY DEFINER` |
| **Paiement** | `create-payment`, `PaymentPage`, webhooks Stripe |
| **Données personnelles** | emails acheteurs, export leads, logs contenant PII |
| **Monitor service** | `services/monitor-service/app/auth.py`, `ADMIN_TOKEN`, fallback paid |
| **Edge Functions** | CORS, rate limits, `RESEND_API_KEY`, `STRIPE_SECRET_KEY` |
| **Suppression données** | DELETE massif machines, quotes, dossiers |
| **Déploiement prod** | variables Vercel, secrets Supabase, deploy functions |

## Règles spécifiques Minegrid

### 1. Bypass accès temporaire (front)

- Variable : `VITE_MONITOR_TEMP_ACCESS_CODE` (`ProtectedRoute.tsx`, `DemoEntrepriseAccess.tsx`).
- **Prod** : doit être **vide** — accès monitor/démo uniquement via compte autorisé.
- Agent : peut documenter/vérifier, **ne pas** définir la valeur en prod.

### 2. Codes promo (front)

- Variable : `VITE_PROMO_CODE` (`Dashboard.jsx`, `ProSubscription.tsx`).
- Validation côté client uniquement — ne remplace pas une validation serveur.
- Agent : ne pas hardcoder de code promo dans le source.

### 3. RLS tables critiques

| Table | Risque si mal configurée |
|-------|--------------------------|
| `machines` | Modification/suppression annonces d’autrui ; vendeur illisible |
| `quote_requests` | Fuite demandes de prix ; insert anon abusif |
| `transaction_cases` | Accès dossiers non participants |
| `transaction_participants` | Insert participants non autorisé |
| `contact_messages` | Fuite messages contact |

Scripts **interdits sans revue** : `archive/scripts/sql/fix-machines-rls-policies.sql` (policies `USING (true)`).

### 4. Flux quote → dossier

- Dossier auto **uniquement** si `buyer_user_id` renseigné et vendeur résolu ≠ acheteur.
- RPC `ensure_transaction_case_for_quote_request` : `SECURITY DEFINER` — grant `authenticated` seulement.
- Triggers ne doivent pas rollback silencieusement sans message actionnable.

### 5. Monitor service

- `SUPABASE_SERVICE_ROLE_KEY` : **serveur uniquement**, jamais front.
- Fallback paid si `pro_clients` absent (`auth.py` L205–212) : **à supprimer** (ticket #4) — agent propose patch, humain valide.
- `ADMIN_TOKEN` : routes `/admin/*` — rotation et secret fort.

### 6. Stripe

- `STRIPE_SECRET_KEY` uniquement Edge Function.
- Front : `@stripe/react-stripe-js` + clé publishable uniquement.
- Tester 401 sans JWT sur `create-payment`.

### 7. Supabase client front

- Clé **anon** seulement dans `supabaseClient.ts`.
- Client typé `any` — ne pas contourner RLS via raw SQL côté client.

### 8. localStorage entreprise

- Config dashboard scopée par `user.id` (`accountLocalStorage`) — ne pas mélanger comptes sur même origine.

## Checklist sécurité PR (Minegrid)

- [ ] Aucun secret dans diff, logs ou commentaires.
- [ ] `.env` / `.env.local` absents du commit.
- [ ] Policies RLS : principe du moindre privilège.
- [ ] Entrées utilisateur échappées / validées (emails, UUID, montants).
- [ ] Pas d’injection SQL via concaténation (prefer RPC paramétrées).
- [ ] Edge Functions : CORS `ALLOWED_ORIGINS` restrictif.
- [ ] Rate limiting contact email testé (429).
- [ ] Rollback : revert commit ou script SQL inverse documenté.
- [ ] Tickets 🔴 marqués « validation humaine requise » dans le résumé PR.

## Niveaux d’autonomie (rappel)

| Niveau | Exemples Minegrid |
|--------|-------------------|
| **0 — Interdit** | Prod DB, secrets, suppression massive, disable auth |
| **1 — Propose** | RLS machines, ProtectedRoute rôles, patch trigger SQL |
| **2 — Implémente + revue** | Tests quoteRequests, fix monitor fallback, refactor widget |
| **3 — Semi-auto** | Documentation ai-context, petits correctifs UI testés |
| **4 — Répétitif** | Formatage, typos docs, renommages sans logique |

## Incident / fuite suspectée

1. Ne pas committer de correctif d’urgence sans revue.
2. Documenter surface (table, route, variable).
3. Escalade humaine immédiate pour rotation secrets si clé exposée.
