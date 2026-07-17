# ⚠️ OBSOLÈTE — Stripe abandonné (société marocaine non éligible).
# Remplacé par `.audit/PADDLE_SETUP.md` (Paddle, Merchant of Record).
# Conservé pour référence : les Edge Functions stripe-* existent encore côté prod.

# Stripe mode test sur le staging — Runbook

Parcours : l'utilisateur choisit un plan payant → `StripePaymentForm` → Edge Function **create-payment**
(crée un PaymentIntent, montant fixé SERVEUR) → carte test → Stripe → **stripe-webhook**
(`payment_intent.succeeded`) active l'abonnement (`pro_clients`), avec dédup `processed_stripe_events`.

Staging ref : `vrouxqofmlbkxgznftja`. URLs des fonctions :
- create-payment : `https://vrouxqofmlbkxgznftja.supabase.co/functions/v1/create-payment`
- stripe-webhook : `https://vrouxqofmlbkxgznftja.supabase.co/functions/v1/stripe-webhook`

## Phase 1 — Clés de test Stripe  [TOI]
1. Stripe dashboard → active **Test mode** (interrupteur en haut à droite).
2. **Developers → API keys** → copie :
   - **Publishable key** `pk_test_…` → PUBLIC → ira dans `.env.staging` (VITE_STRIPE_PUBLISHABLE_KEY).
   - **Secret key** `sk_test_…` → SECRET → ira dans les secrets de la fonction (Phase 2), **jamais dans le chat**.

## Phase 2 — Déployer les 2 fonctions sur le staging + secrets  [TOI]
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_ton_jeton"
cd "C:\Users\Public\projets\SITE_MINEGRID_EQUIPEMENT_COVER\SITE_MINEGRID_EQUIPEMENT_cover 1"
npx supabase functions deploy create-payment --project-ref vrouxqofmlbkxgznftja
npx supabase functions deploy stripe-webhook --project-ref vrouxqofmlbkxgznftja
```
Secrets — Dashboard **staging** → **Edge Functions → Secrets** (ou CLI `supabase secrets set`) :
- `STRIPE_SECRET_KEY` = `sk_test_…`
- `ALLOWED_ORIGINS` = `http://localhost:5199,https://minegrid-equipement.com`  ← IMPORTANT (le staging tourne sur :5199, sinon CORS bloque create-payment)
- `STRIPE_WEBHOOK_SECRET` = (Phase 3)

## Phase 3 — Webhook Stripe (test) → staging  [TOI]
1. Stripe (Test mode) → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL : `https://vrouxqofmlbkxgznftja.supabase.co/functions/v1/stripe-webhook`
3. Événements : **payment_intent.succeeded** (et `checkout.session.completed`).
4. Copie le **Signing secret** `whsec_…` → secret `STRIPE_WEBHOOK_SECRET` sur la fonction staging.

## Phase 4 — Tester  [TOI + MOI]
1. `.env.staging` : `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…` → relancer `npm run dev -- --mode staging`.
2. Sur le staging, connecte-toi → page d'abonnement → choisis un plan.
3. Carte test : **4242 4242 4242 4242**, date future, CVC `123`, code postal quelconque.
4. Attendu : paiement OK → webhook `payment_intent.succeeded` → `pro_clients` activé.
5. Vérifs : Stripe (test) → le paiement apparaît ; logs de stripe-webhook (200) ; `pro_clients` sur staging.

Cartes de test utiles : succès `4242 4242 4242 4242` ; refus `4000 0000 0000 0002` ; 3D Secure `4000 0025 0000 3155`.
