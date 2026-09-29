# Déployer les fonctions serveur — mode d'emploi

> Relevé du 2026-09-29 : **2 fonctions déployées sur 13.** Les onze autres
> répondent « introuvable » en production. C'est ce qui bloque le paiement, la
> suppression de compte (RGPD) et l'IA des appels d'offres.
>
> Cette opération est **la vôtre** : elle demande vos identifiants Supabase, que
> je n'ai pas et que vous ne devez pas me donner.

## Ce qui répond aujourd'hui, et ce qui ne répond pas

Vérifié par appel direct sur `https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/…` :

| Fonction | État | Ce qui ne marche pas sans elle |
|---|---|---|
| `ai-proxy` | ✅ déployée | — |
| `send-contact-email` | ✅ déployée | — |
| `paddle-webhook` | ❌ | **Un paiement réussi n'active jamais l'abonnement.** Le client paie et n'a rien. |
| `paddle-upgrade` | ❌ | Changement de formule impossible |
| `paddle-cancel` | ❌ | Résiliation impossible |
| `tenders-ai` | ❌ | Les appels d'offres restent en « mode simulation » |
| `delete-account` | ❌ | **Suppression de compte RGPD indisponible** |
| `send-email` | ❌ | Courriels transactionnels |
| `exchange-rates` | ❌ | Taux de change figés |
| `escrow-webhook` | ❌ | Séquestre |
| `recompute-trust-score` | ❌ | Score de confiance |
| `create-payment`, `stripe-webhook` | ❌ | Stripe — **inutiles** : Stripe refuse le Maroc, le projet est passé à Paddle |

## Ordre recommandé

1. **`paddle-webhook`** — le plus urgent dès que vous encaissez. Sans lui, un
   paiement réussi n'active rien : le client est débité et n'a pas son
   abonnement. À déployer **avant** d'ouvrir le paiement, pas après.
2. **`delete-account`** — obligation RGPD.
3. **`tenders-ai`** — enlève la mention « mode simulation ».
4. **`paddle-upgrade`** puis **`paddle-cancel`** — changement et résiliation.
5. Le reste selon vos besoins. **N'y mettez pas** `create-payment` ni
   `stripe-webhook`.

## Les commandes

⚠️ Sur cette machine, la CLI Supabase (2.113.0) ne relit pas les identifiants
de `supabase login` — c'est un défaut connu du gestionnaire d'identifiants
Windows. Il faut donc passer par la variable d'environnement.

**Étape 1 — votre jeton d'accès.** Créez-le sur
`https://supabase.com/dashboard/account/tokens`.

> 🔒 **Ne me le collez pas dans la conversation.** Tout ce qui est écrit ici est
> enregistré en clair sur le disque. Un jeton d'accès Supabase ouvre la
> totalité de votre compte. Il se pose dans le terminal, et nulle part ailleurs.

Dans PowerShell, à la racine du projet :

```bash
$env:SUPABASE_ACCESS_TOKEN = "sbp_votre_jeton"
```

**Étape 2 — les secrets dont chaque fonction a besoin.** Elles échouent au
démarrage s'ils manquent. `SUPABASE_URL`, `SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement par Supabase : vous
n'avez **que** les suivants à poser.

| Fonction | À poser vous-même |
|---|---|
| `paddle-webhook` | `PADDLE_WEBHOOK_SECRET` |
| `paddle-upgrade`, `paddle-cancel` | `PADDLE_API_KEY`, `PADDLE_ENV`, `ALLOWED_ORIGINS` |
| `tenders-ai` | `ANTHROPIC_API_KEY`, `TENDERS_AI_MODEL`, `TENDERS_AI_DAILY_LIMIT`, `TENDERS_AI_REQUIRE_AUTH`, `ALLOWED_ORIGINS` |
| `delete-account` | `ALLOWED_ORIGINS` |
| `send-email` | `RESEND_API_KEY`, `CONTACT_SENDER_EMAIL`, `CONTACT_RECEIVER_EMAIL`, `ALLOWED_ORIGINS` |
| `escrow-webhook` | `ESCROW_WEBHOOK_SECRET` |
| `recompute-trust-score` | `ADMIN_TOKEN` |
| `exchange-rates` | aucun |

`ALLOWED_ORIGINS` vaut `https://minegrid-equipement.com` en production.

Pour poser un secret (il n'apparaît jamais dans le code ni dans git) :

```bash
npx supabase secrets set PADDLE_WEBHOOK_SECRET=... --project-ref tnfbggrftmtxpgbcwqzo
```

**Étape 3 — déployer.** Une fonction à la fois, en vérifiant entre chaque :

```bash
npx supabase functions deploy paddle-webhook --project-ref tnfbggrftmtxpgbcwqzo
```

**Étape 4 — vérifier.** Une fonction déployée répond `401` (elle existe et
demande une autorisation). Un `404` signifie qu'elle n'est pas là.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/paddle-webhook
```

## Après le déploiement

- **Staging d'abord, production ensuite** — même commande avec
  `--project-ref vrouxqofmlbkxgznftja`.
- Côté Paddle, l'URL du webhook doit pointer sur
  `https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/paddle-webhook`.
- Le `502` connu de `paddle-upgrade` a été traité à l'aveugle le 2026-08-14
  (levée du changement programmé) : **il reste à confirmer** une fois la
  fonction en ligne, avec un vrai changement de formule en bac à sable.
- Relancez `npm run bases` : il vous dira ce qui manque encore.
