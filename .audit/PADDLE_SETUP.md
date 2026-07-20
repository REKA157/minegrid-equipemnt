# Paddle (sandbox) sur le staging — Runbook

Remplace `.audit/STRIPE_TEST_SETUP.md` (Stripe impossible : société marocaine).
Paddle = **Merchant of Record** : le checkout est hébergé par Paddle (aucune carte
saisie sur notre site), les montants sont ceux du **catalogue Paddle** (pas du
client), et l'activation d'abonnement est faite **uniquement** par l'Edge Function
`paddle-webhook` (signature HMAC vérifiée, idempotence `processed_paddle_events`).

Parcours : page de tarifs → `PaddleCheckoutButton` → overlay Paddle → paiement →
Paddle appelle `paddle-webhook` → activation `pro_clients` (+30 j ou fin de période)
→ le front voit l'abonnement via `get_effective_subscription`.

Staging ref : `vrouxqofmlbkxgznftja`.
URL du webhook : `https://vrouxqofmlbkxgznftja.supabase.co/functions/v1/paddle-webhook`

## Grille (validée 2026-07) — codes internes ≠ noms affichés
| Affiché | Prix | Code interne (base) | Variable des identifiants de prix |
|---|---|---|---|
| Premium | 20 $/mois | `pro` | `…PRICE_PREMIUM_20USD` |
| Pro ⭐ | 50 $/mois | `premium` | `…PRICE_PRO_50USD` |
| Enterprise | 200 $/mois | `enterprise` | `…PRICE_ENTERPRISE_200USD` |

## Phase 1 — Catalogue + jetons publics  [TOI]
1. Paddle **sandbox** → Catalogue : 3 produits (Premium 20 / Pro 50 / Enterprise 200,
   USD, mensuel). Supprimer/archiver l'ancien « Basic 29 € ».
2. Noter les 3 identifiants de prix `pri_…` (publics, OK en chat).
3. **Developer tools → Authentication → Client-side tokens** → créer un token
   (préfixe `test_` en sandbox ; PUBLIC, OK en chat).
4. Remplir dans `.env.staging` : `VITE_PADDLE_CLIENT_TOKEN` + les 3 `VITE_PADDLE_PRICE_…`
   puis relancer `npm run dev -- --mode staging`.

## Phase 2 — Déployer le webhook sur le staging + secrets  [TOI]
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_ton_jeton"   # jamais dans le chat
cd "C:\Users\Public\projets\SITE_MINEGRID_EQUIPEMENT_COVER\SITE_MINEGRID_EQUIPEMENT_cover 1"
npx supabase functions deploy paddle-webhook --no-verify-jwt --project-ref vrouxqofmlbkxgznftja
```
Appliquer aussi la migration `supabase/migrations/20260717100000_paddle_payments.sql`
sur le staging (SQL editor — idempotente).

## Phase 3 — Notification destination Paddle  [TOI]
1. Paddle sandbox → **Developer tools → Notifications → New destination**.
2. URL = celle du webhook ci-dessus ; type Webhook ; événements :
   **transaction.completed** + **subscription.canceled**.
3. Copier la **clé secrète** de la destination (`pdl_ntfset_…`) → **secret** (jamais
   dans le chat) : Dashboard staging → Edge Functions → Secrets :
   - `PADDLE_WEBHOOK_SECRET` = cette clé
   - `PADDLE_PRICE_PREMIUM_20USD` / `PADDLE_PRICE_PRO_50USD` /
     `PADDLE_PRICE_ENTERPRISE_200USD` = les 3 `pri_…` (mêmes valeurs que le front)

## Phase 4 — Tester  [TOI + MOI]
1. Staging (`:5199`) → connexion → page d'abonnement → choisir un plan.
2. Carte de test Paddle : **4242 4242 4242 4242**, date future, CVC `100`.
3. Attendu : overlay Paddle → paiement OK → « Activation de votre abonnement… » →
   redirection vers l'espace du plan.
4. Vérifs : Paddle sandbox → Transactions (completed) ; logs `paddle-webhook` (200) ;
   `pro_clients` sur staging (`subscription_type` correct, `payment_method='paddle'`).
5. Contre-cas : rejouer la notification depuis Paddle (bouton « resend ») →
   réponse `idempotent: true`, pas de prolongation.

## Phase 5 — Résiliation en un clic (fonction `paddle-cancel`)  [TOI]
Le bouton « Résilier mon abonnement » du site appelle cette fonction, qui annule
VRAIMENT l'abonnement via l'API Paddle (prise d'effet en fin de période payée).
1. Paddle sandbox → **Developer tools → Authentication → API keys** → crée une
   **API key** (⚠️ SECRÈTE — jamais dans le chat ni dans le front).
2. Dashboard staging → **Edge Functions → Secrets** : `PADDLE_API_KEY` = cette clé,
   `PADDLE_ENV` = `sandbox`.
3. Déployer (AVEC vérification JWT — donc SANS --no-verify-jwt) :
```powershell
npx supabase functions deploy paddle-cancel --project-ref vrouxqofmlbkxgznftja
```
4. Test : connecté avec un abonnement Paddle actif → Mon abonnement → « Résilier »
   → toast de confirmation ; Paddle → Subscriptions → statut « scheduled to cancel » ;
   à l'échéance, `paddle-webhook` reçoit subscription.canceled → `pro_clients.subscription_status='inactive'`.

## Passage en production (plus tard)
Compte Paddle **live** (vérification d'identité de la société requise) → recréer
catalogue + token + destination en live, `VITE_PADDLE_ENV=production`, secrets sur
le projet prod, et appliquer la migration en prod. Test critique : une vraie carte
marocaine (dotation e-commerce) — cf. `.audit/PAYMENT_PROVIDER_ANALYSIS.md`.
