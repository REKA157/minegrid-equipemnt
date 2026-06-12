# Checklist de finalisation sécurité (Supabase/Edge)

Cette checklist finalise les changements codés dans:
- `supabase/functions/send-contact-email/index.ts`
- `supabase/functions/create-payment/index.ts`
- les écrans front avec codes temporaires/promo passés en variables d'environnement.

## 1) Variables front (Vite)

Définir dans votre environnement front:

- `VITE_MONITOR_TEMP_ACCESS_CODE` (optionnel, vide en prod si bypass interdit)
- `VITE_PROMO_CODE` (optionnel, vide pour désactiver les promos manuelles)

## 2) Secrets / vars Edge Functions (Supabase)

Définir côté Supabase (Project Settings -> Edge Functions secrets):

- `ALLOWED_ORIGINS=https://minegrid-equipement.com,http://localhost:5173`
- `RESEND_API_KEY=...`
- `CONTACT_RECEIVER_EMAIL=contact@minegrid-equipement.com`
- `CONTACT_SENDER_EMAIL=contact@minegrid-equipement.com` (optionnel)
- `SUPABASE_URL` (normalement déjà présent)
- `SUPABASE_ANON_KEY` (normalement déjà présent)
- `SUPABASE_SERVICE_ROLE_KEY` (normalement déjà présent)
- `STRIPE_SECRET_KEY=...`

## 3) Déployer les fonctions

```bash
supabase functions deploy send-contact-email
supabase functions deploy create-payment
```

## 4) Vérification fonctionnelle rapide (obligatoire)

1. **Contact email**
   - Soumettre le formulaire contact.
   - Vérifier en Network que la requête vers `send-contact-email` répond en `200`.
   - Vérifier que le mail est reçu sur `CONTACT_RECEIVER_EMAIL`.

2. **Blocage abuse email**
   - Envoyer plusieurs requêtes rapidement.
   - Vérifier qu'un `429` apparaît après dépassement du quota.

3. **Paiement**
   - Appeler `create-payment` sans JWT: attendu `401`.
   - Appeler avec JWT valide: attendu `200` et `clientSecret`.

4. **CORS**
   - Tester une origine non listée: pas d'accès valide attendu.
   - Tester les origines autorisées: accès OK.

5. **Bypass démo**
   - Laisser `VITE_MONITOR_TEMP_ACCESS_CODE` vide.
   - Vérifier que les écrans démo n'accordent plus d'accès par code.

## 5) Vérification DB

- Confirmer que la table cible de statut email est bien `contact_messages`.
- Vérifier les policies RLS sur `contact_messages`:
  - `INSERT` autorisé à `anon`/`authenticated`.
  - Pas de `SELECT` public non voulu.

