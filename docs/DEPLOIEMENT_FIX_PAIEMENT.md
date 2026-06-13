# Paquet de déploiement — Verrou n°4 (paiement + secrets)

> But : **armer en une session** le correctif qui ferme le contournement de paiement
> et rotater les secrets exposés. Tant que ces étapes ne sont pas faites, le verrou
> *base de données* n'est pas actif (les verrous *code* le sont déjà, en branche
> `fix/critical-security-hardening`).
>
> Pré-requis : Supabase CLI (`npm i -g supabase`), accès au projet Supabase prod,
> accès au dashboard Stripe, accès OpenAI/Piloterr pour la rotation.
> Référence du projet : `tnfbggrftmtxpgbcwqzo`.

---

## Étape 0 — Mesurer le stock réel (5 min, AVANT tout)

C'est la donnée la moins chère et la plus décisive. Dans **Supabase → SQL Editor**,
coller et exécuter `sql/diagnostic_stock_reel.sql` (bloc par bloc). Noter :
`vendeurs_reels_distincts`, `vendeur_fantome_scraper`, et le **BLOC 6** (abonnements
actifs sans paiement Stripe = bénéficiaires du contournement à nettoyer).

---

## Étape 1 — Rotation des secrets exposés (CRITIQUE, en premier)

Les secrets de `services/monitor-service/.env` doivent être traités comme **compromis**
(fichier en clair dans `C:\Users\Public`, world-readable).

| Secret | Où le roter | Action |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_JWT_SECRET` | Supabase → Settings → API → **Reset/Roll** | ⚠️ invalide les JWT en cours : prévoir une fenêtre |
| `LLM_API_KEY` (OpenAI `sk-proj-…`) | platform.openai.com → API keys → Revoke + Create | — |
| `PILOTERR_API_KEY` | dashboard Piloterr → Regenerate | — |
| Mot de passe DB (`DATABASE_URL`) | Supabase → Database → reset password | — |
| `ADMIN_TOKEN` (`changeme-admin-token-2026`) | générer fort : `openssl rand -hex 32` | ≠ valeur d'exemple |

Puis :
- Déplacer le projet **hors de `C:\Users\Public`** (répertoire utilisateur privé).
- Réécrire `services/monitor-service/.env` avec les **nouvelles** valeurs.
- **Build front prod** : `VITE_MONITOR_ADMIN_TOKEN`, `VITE_PROMO_CODE`,
  `VITE_MONITOR_TEMP_ACCESS_CODE` doivent rester **VIDES** (sinon inlinés dans le bundle).

---

## Étape 2 — Appliquer la migration RLS `pro_clients`

Ferme le contournement au niveau base (écritures réservées à `service_role`).

**Option A (SQL Editor)** : coller le contenu de
`sql/2026-06_pro_clients_rls_hardening.sql` et exécuter.

**Option B (CLI)** :
```bash
supabase link --project-ref tnfbggrftmtxpgbcwqzo
supabase db execute --file sql/2026-06_pro_clients_rls_hardening.sql
```

Vérifier ensuite (doit ne montrer qu'une policy SELECT) :
```sql
SELECT policyname, cmd, roles FROM pg_policies
WHERE tablename = 'pro_clients' ORDER BY policyname;
```

---

## Étape 3 — Déployer les Edge Functions

```bash
# Webhook Stripe : PAS de JWT Supabase (l'auth = signature Stripe)
supabase functions deploy stripe-webhook --no-verify-jwt

# create-payment (premium accepté + grille EUR unique)
supabase functions deploy create-payment

# send-email durci (JWT + allow-list + destinataire fixe)
supabase functions deploy send-email
```

> Les fonctions orphelines `create-payment-intent` et `create-payment/index.js`
> ont été **supprimées** du dépôt (surfaces non authentifiées). Si elles avaient
> déjà été déployées, les retirer : `supabase functions delete create-payment-intent`.

### Secrets des fonctions (Supabase → Edge Functions → Secrets, ou CLI)
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx   # fourni à l'étape 4
supabase secrets set ALLOWED_ORIGINS=https://minegrid-equipement.com,http://localhost:5173
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set CONTACT_RECEIVER_EMAIL=contact@minegrid-equipement.com
supabase secrets set CONTACT_SENDER_EMAIL=contact@minegrid-equipement.com
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sont injectés
# automatiquement par la plateforme dans les fonctions.
```

---

## Étape 4 — Enregistrer le webhook côté Stripe

1. URL de la fonction :
   `https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/stripe-webhook`
2. Stripe Dashboard → Developers → **Webhooks** → *Add endpoint* → coller l'URL.
3. Événements à écouter : **`payment_intent.succeeded`** (et `checkout.session.completed`).
4. Copier le **Signing secret** (`whsec_…`) → c'est le `STRIPE_WEBHOOK_SECRET` de l'étape 3.
5. Redéployer si le secret a été ajouté après : `supabase functions deploy stripe-webhook --no-verify-jwt`.

---

## Étape 5 — Vérifications (le verrou est-il armé ?)

1. **Écriture client bloquée** — connecté en utilisateur normal, en console :
   ```js
   await supabase.from('pro_clients').insert({ user_id: (await supabase.auth.getUser()).data.user.id, subscription_type:'enterprise', subscription_status:'active' })
   ```
   → doit renvoyer une **erreur RLS** (plus d'auto-abonnement).
2. **Paiement réel → activation serveur** : payer en test (carte `4242…`) → la ligne
   `pro_clients` apparaît avec `payment_method='stripe'` et `stripe_payment_intent_id` rempli
   (écrite par le webhook, pas par le client).
3. **Plan Premium** : le tunnel Premium ne renvoie plus `400 Plan invalide`.
4. **send-email** : `POST` sans `Authorization` → **401** ; origine non listée → CORS refusé.
5. **Nettoyage** : désactiver les abonnements frauduleux trouvés au BLOC 6 :
   ```sql
   UPDATE public.pro_clients SET subscription_status = 'inactive'
   WHERE subscription_status = 'active'
     AND (stripe_payment_intent_id IS NULL OR payment_method <> 'stripe');
   ```

---

## Étape 6 — Front : gating dérivé du serveur (suite, hors-déploiement)

Le verrou base + webhook ferme l'**écriture**. Reste à faire dériver l'**affichage**
de l'abonnement d'une lecture serveur (`pro_clients` via RLS SELECT) au lieu de
`localStorage` (findings #5). C'est un patch front à part (Phase 1 résiduelle),
sans impact sur la sécurité d'encaissement déjà acquise par les étapes 2-4.

---

## Récapitulatif « armé / non armé »

| Verrou | État après ce runbook |
|---|---|
| Écriture `pro_clients` côté client | **Bloquée** (RLS) ✅ |
| Activation = paiement Stripe signé | **Oui** (webhook) ✅ |
| Secrets prod | **Rotés** ✅ |
| Plan Premium / grille prix | **Cohérents** ✅ |
| `send-email` relais ouvert | **Fermé** ✅ |
| Gating d'affichage `localStorage` | Reste à dériver du serveur (Étape 6) ⏳ |
