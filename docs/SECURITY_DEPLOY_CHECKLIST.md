# Checklist sécurité déploiement — Minegrid (Ticket #5)

Document de référence pour **production** : bypass temporaires, codes promo, variables sensibles et contrôles avant release.

> Dernière revue statique code : alignée sur `src/` + Edge Functions + monitor-service.  
> **Ne pas committer** de `.env` réel. Vérifier **Vercel** (front) et **Supabase / Docker** (backend) séparément.

---

## 0) Matrice production (obligatoire)

| Variable | Environnement | Prod attendu | Risque si renseignée |
|----------|---------------|--------------|----------------------|
| `VITE_MONITOR_TEMP_ACCESS_CODE` | Front (Vite) | **VIDE** | Bypass routes protégées + fausse session démo |
| `VITE_PROMO_CODE` | Front (Vite) | **VIDE** | Abonnement / enterprise activés côté client sans paiement |
| `VITE_MONITOR_ADMIN_TOKEN` | Front (Vite) | **VIDE** (sauf outil admin interne) | Token admin monitor exposé dans le bundle |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Front | `pk_live_…` ou `pk_test_…` selon env | Clé **publique** — OK ; jamais `sk_*` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Front | Projet prod | Anon key **publique par design** — RLS doit protéger |
| `STRIPE_SECRET_KEY` | Edge Function uniquement | Secret Supabase | Fuite = paiements frauduleux |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge / monitor-service | Secret serveur | **Jamais** dans le front |
| `ADMIN_TOKEN` | monitor-service `.env` | Fort, unique, rotatable | Routes `/admin/*` du monitor |
| `SUPABASE_JWT_SECRET` | monitor-service `.env` | Secret Supabase | Vérification JWT monitor |

---

## 1) Bypass temporaire — `VITE_MONITOR_TEMP_ACCESS_CODE`

### Fichiers concernés

| Fichier | Comportement si variable **non vide** |
|---------|----------------------------------------|
| `src/components/ProtectedRoute.tsx` | Accès sans login si `sessionStorage.monitor_temp_access === 'granted'` ou code saisi |
| `src/pages/Login.tsx` | Bloc « Accès démo » → faux `localStorage.user` + `monitor_temp_access` |
| `src/pages/Register.tsx` | Idem login |
| `src/pages/DemoEntrepriseAccess.tsx` | `#demo-entreprise` → flags enterprise dans `localStorage` |

### Routes impactées par `ProtectedRoute`

- `#global-monitor`
- `#admin-sources`
- `#leads`
- `#dossiers` / `#dossier/<uuid>`

### Comportement attendu en production

1. `VITE_MONITOR_TEMP_ACCESS_CODE` **absent ou vide** au build Vercel.
2. Écran Global Monitor : **pas** de champ « Code d'accès » — message « Connectez-vous ».
3. `#demo-entreprise` : message **« Accès démo désactivé sur cet environnement »**.
4. Login / Register : **pas** de lien « Accès démo (code temporaire) ».

### Vérification manuelle

```text
1. Build prod ou preview Vercel sans la variable.
2. Ouvrir #global-monitor → exiger connexion Supabase.
3. Ouvrir #demo-entreprise → bandeau amber « désactivé ».
4. DevTools → Application → sessionStorage : pas de clé monitor_temp_access persistée après test.
```

### Note audit

- Le code n'est **plus hardcodé** dans `ProtectedRoute` (README roadmap obsolète) : tout passe par `import.meta.env` → **inclus dans le bundle** si défini au build. **Ne jamais définir en prod.**

---

## 2) Codes promo — `VITE_PROMO_CODE`

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `src/pages/Dashboard.jsx` | Validation promo → upsert `pro_clients` |
| `src/pages/ProSubscription.tsx` | Idem + UI abonnement |
| `src/pages/PaymentPage.tsx` | Validation promo avant paiement |

### Comportement attendu en production

1. `VITE_PROMO_CODE` **vide** → toast « Les codes promo sont désactivés sur cet environnement ».
2. Option « Code promo » inutilisable ou refusée à la validation.

### Risque sécurité (documenté)

- La validation est **100 % côté client** : si `VITE_PROMO_CODE` est défini au build, la valeur est **extractible** du JS (même principe que tout `VITE_*`).
- Un ancien code documenté (`082025`) apparaît dans `docs/GUIDE_SYSTEME_PAIEMENT_CODE_PROMO.md` et scripts `archive/` — **pas dans `src/`** (OK), mais ne pas réintroduire en dur.
- **Recommandation prod** : laisser vide ; abonnements via **Stripe** (`create-payment`) + RLS `pro_clients`.

### Vérification manuelle

```text
1. Dashboard → souscription → choisir « Code promo » → message désactivé.
2. PaymentPage → saisir un code au hasard → refus si VITE_PROMO_CODE vide.
```

---

## 3) Stripe

### Front

- `VITE_STRIPE_PUBLISHABLE_KEY` → `src/hooks/useStripe.ts`, `src/components/StripePaymentForm.tsx`
- Uniquement clé **publishable** (`pk_…`).

### Edge Function

- `supabase/functions/create-payment/index.ts`
- Secrets : `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- JWT obligatoire (401 sans token)
- Rate limit IP (429)
- CORS via `ALLOWED_ORIGINS`

### Vérification

1. POST `create-payment` **sans** `Authorization` → **401**.
2. POST avec JWT utilisateur valide → **200** + `clientSecret`.
3. Origine non listée dans `ALLOWED_ORIGINS` → pas d'accès CORS valide.

```bash
supabase functions deploy create-payment
supabase functions deploy send-contact-email
```

---

## 4) Supabase (front vs serveur)

### Autorisé dans le front (`.env.example` racine)

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Interdit dans le front

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (sauf si erreur de config — réservé monitor-service)

### Edge Functions (secrets Supabase Dashboard)

- `ALLOWED_ORIGINS=https://minegrid-equipement.com,https://www.minegrid-equipement.com,http://localhost:5173`
- `RESEND_API_KEY`
- `CONTACT_RECEIVER_EMAIL` / `CONTACT_SENDER_EMAIL`
- `STRIPE_SECRET_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (selon fonction)

### Alignement contact

- `VITE_CONTACT_RECEIVER_EMAIL` (front) doit correspondre à `CONTACT_RECEIVER_EMAIL` (Edge).

---

## 5) Global Monitor — tokens

### Front (`src/services/monitorApi.ts`)

- `VITE_MONITOR_API_URL` → URL API prod (HTTPS).
- `VITE_MONITOR_ADMIN_TOKEN` → **vide en prod publique** ; n'envoie `X-Admin-Token` que si renseigné.

### Service Python (`services/monitor-service/`)

- `ADMIN_TOKEN` → routes `/admin/*` (comparaison constant-time).
- `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_JWT_SECRET` → vérif abonnement `pro_clients`.
- **Ticket #4** : plus de fallback paid si table absente — `pro_clients` requis pour accès JWT.

### Vérification monitor prod

1. Utilisateur sans abonnement actif → monitor API **403**.
2. `ADMIN_TOKEN` fort (≠ `changeme-admin-token-2026`).
3. Pas de `VITE_MONITOR_ADMIN_TOKEN` dans le build client public.

---

## 6) Absence de secrets dans le dépôt

### Contrôles effectués (audit statique)

| Contrôle | Résultat |
|----------|----------|
| `.env` / `.env.local` dans `.gitignore` | OK |
| Clés `sk_live_` / `sk_test_` longues dans `src/` | Non trouvées |
| JWT / service role hardcodés dans `src/` | Non trouvés |
| Code promo `082025` dans `src/` | Non trouvé (présent dans `docs/` et `archive/` uniquement) |
| `VITE_*` lus via `import.meta.env` (pas de défaut secret) | OK pour bypass/promo/admin |

### Commandes de re-scan avant release

```bash
# Depuis la racine du dépôt (PowerShell / bash)
rg -i "sk_live_|sk_test_[a-zA-Z0-9]{20,}|service_role|SUPABASE_SERVICE" src supabase --glob "!*.test.*"
rg "VITE_MONITOR_TEMP_ACCESS_CODE|VITE_PROMO_CODE" .env .env.local 2>/dev/null || true
# Ne doit rien afficher si .env non versionné
git ls-files | rg "^\.env$"
# Doit être vide
```

### Fichiers à ne pas committer

- `.env`, `.env.local`, `.env.*.local`
- `services/monitor-service/.env`

---

## 7) Variables front complémentaires (`.env.example`)

| Variable | Prod | Note |
|----------|------|------|
| `VITE_PRODUCTION_URL` | URL canonique | SEO / liens |
| `VITE_MONITOR_API_URL` | HTTPS API monitor | Pas localhost |
| `VITE_N8N_*` | URLs prod ou vides | Webhooks optionnels |
| `VITE_WHATSAPP_NUMBER` | Optionnel | Chat widget |
| `VITE_GOOGLE_MAPS_API_KEY` | Si cartes Google | Restreindre clé par domaine Google Cloud |

---

## 8) Checklist pré-merge / pré-deploy (copier-coller)

### Front Vercel

- [ ] `VITE_MONITOR_TEMP_ACCESS_CODE` **non défini** (ou vide)
- [ ] `VITE_PROMO_CODE` **non défini** (ou vide)
- [ ] `VITE_MONITOR_ADMIN_TOKEN` **non défini** (sauf build admin interne)
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` = clé publishable correcte (live vs test)
- [ ] `VITE_SUPABASE_*` = projet **production**
- [ ] Preview deploy testé : bypass démo désactivé (section 1)

### Supabase Edge

- [ ] `ALLOWED_ORIGINS` inclut le domaine prod uniquement (+ localhost dev si besoin)
- [ ] `STRIPE_SECRET_KEY` = live ou test cohérent avec `pk_` front
- [ ] `RESEND_API_KEY` présent si contact email actif
- [ ] Functions déployées (`send-contact-email`, `create-payment`)

### Monitor service

- [ ] `ADMIN_TOKEN` fort, unique
- [ ] `SUPABASE_JWT_SECRET` aligné projet prod
- [ ] `SUPABASE_SERVICE_ROLE_KEY` **serveur uniquement**
- [ ] Table `pro_clients` déployée (accès monitor JWT)

### Fonctionnel rapide (obligatoire)

1. **Contact** : formulaire → `send-contact-email` → 200 + mail reçu.
2. **Abuse email** : rafales → 429.
3. **Paiement** : sans JWT → 401 ; avec JWT → clientSecret.
4. **CORS** : origine non autorisée bloquée.
5. **Bypass démo** : sections 1 et 2 validées.
6. **Promo** : désactivée si `VITE_PROMO_CODE` vide.

### Base de données

- [ ] Table `contact_messages` + RLS : INSERT anon/auth OK ; SELECT public non voulu absent.
- [ ] `pro_clients` : RLS empêche upsert abusif depuis client si promo réactivée par erreur.

---

## 9) Comportement attendu — synthèse production

```text
Visiteur / utilisateur standard
├── Pas de code temporaire monitor ni promo dans le bundle
├── Routes #leads / #dossiers / #global-monitor → session Supabase requise
├── Abonnement → Stripe ou statut en base (pas promo client)
└── Anon Supabase limité par RLS

Ops / démo (non prod publique)
├── Bypass et promo uniquement sur preview local avec .env.local explicite
└── ADMIN_TOKEN monitor jamais dans le front public
```

---

## 10) Références code

- Bypass : `src/components/ProtectedRoute.tsx`, `Login.tsx`, `Register.tsx`, `DemoEntrepriseAccess.tsx`
- Promo : `Dashboard.jsx`, `ProSubscription.tsx`, `PaymentPage.tsx`
- Monitor client : `src/services/monitorApi.ts`
- Paiement : `supabase/functions/create-payment/index.ts`
- Exemple env front : `.env.example`
- Exemple env monitor : `services/monitor-service/.env.example`
- Contexte agents : `ai-context/SECURITY_RULES.md`, `ai-context/DELEGATION_MATRIX.md`

---

## Risques restants (hors scope doc)

- `ProtectedRoute` n'applique **pas** de rôles métier (Ticket #3) — tout compte connecté accède aux routes protégées si bypass désactivé.
- Promo / démo Login écrivent dans `localStorage` — contournement UI possible sans durcissement serveur.
- Documentation legacy `docs/GUIDE_SYSTEME_PAIEMENT_CODE_PROMO.md` mentionne encore le code `082025`.
