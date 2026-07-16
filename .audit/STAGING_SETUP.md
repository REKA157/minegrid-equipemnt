# Staging MineGrid — Runbook (montage pas à pas)

But : un **clone isolé** de la prod (même structure, **zéro donnée réelle**) pour tester migrations,
paiement/escrow et charge **sans jamais risquer la prod**.

Convention : **[TOI]** = action dans ton compte (dashboard / une commande). **[MOI]** = je prépare
et je vérifie en Docker. On avance **une étape à la fois**, on vérifie, puis on enchaîne.

Prod project ref : `tnfbggrftmtxpgbcwqzo`.

---

## Phase A — Fondation : staging = copie du schéma de prod

### A1. Créer le projet Supabase staging  [TOI]
1. https://supabase.com/dashboard → **New project**.
2. Organisation : la tienne. **Name** : `minegrid-staging`. **Region** : la **même que la prod** (latence/cohérence).
3. **Database password** : génère un mot de passe fort et **sauvegarde-le** (gestionnaire de mots de passe).
   ⚠️ Ne le colle jamais dans le chat.
4. **Create new project**, attends ~2 min qu'il soit prêt.
5. Note (Settings → API) : **Project URL**, **anon key**, **service_role key**. Et le **ref** (le code dans
   l'URL `dashboard/project/<REF>`). Le **ref** et l'**URL** ne sont pas secrets ; anon key = public ;
   **service_role key = SECRET** (ne la colle pas ici).

### A2. Extraire le schéma RÉEL de la prod → fichier « baseline »  [TOI]
> On dump la **structure** (tables, RLS, fonctions, triggers) — **pas** les données, **pas** les secrets.
> C'est aussi le correctif du finding F-002 (source unique reproductible).

Mot de passe DB de la prod introuvable ? Rien ne s'y connecte en direct (vérifié) → tu peux le réinitialiser
sans risque : Dashboard **PROD** → Settings → Database → **Reset database password**.

Dans **PowerShell** :
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_ton_jeton"     # le même qu'au déploiement des fonctions ; garde-le local
cd "C:\Users\Public\projets\SITE_MINEGRID_EQUIPEMENT_COVER\SITE_MINEGRID_EQUIPEMENT_cover 1"
npx supabase link --project-ref tnfbggrftmtxpgbcwqzo   # PROD ; il demande le mot de passe DB de la prod
npx supabase db dump --linked -f supabase/migrations/00000000000000_baseline.sql
```
Puis committe le fichier `supabase/migrations/00000000000000_baseline.sql` (schéma, sûr à versionner en local)
et **dis-le-moi**.

### A3. Vérifier la baseline  [MOI]
Je relis le dump + je l'applique sur un Postgres jetable (Docker) pour confirmer qu'il se rejoue **sans erreur**
(et je retire d'éventuels résidus prod-only). Feu vert avant A4.

### A4. Appliquer la baseline sur le STAGING  [TOI]
```powershell
npx supabase link --project-ref <REF_STAGING>     # cette fois le staging ; mot de passe DB staging
npx supabase db push                              # applique la baseline sur le staging
```
(Alternative si besoin : coller le contenu du fichier dans le SQL Editor du **staging**.)

### A5. Semer de fausses données  [MOI prépare → TOI exécute]
Je fournis `supabase/tests/staging_seed.sql` (faux vendeurs, engins, acheteurs, un devis, un dossier…). Tu le
colles dans le SQL Editor du **staging**. Aucune donnée réelle.

---

## Phase B — Brancher le site sur le staging

### B1. Config  [MOI prépare → TOI remplis]
Copie `.env.staging.example` en **`.env.staging`** (non versionné) et remplis avec les valeurs **staging** +
les clés **Stripe TEST**.

### B2. Lancer  [TOI]
```powershell
npm run dev -- --mode staging
```
Vite chargera `.env.staging` (prioritaire sur `.env.local`). Tu navigues → tu es sur le staging.

---

## Phase C — Tester (au choix, après la fondation)

- **Migrations avant prod** : toute future migration → `db push` sur le staging d'abord, on clique, puis prod.
- **Paiement/escrow E2E** : Stripe en mode test (carte `4242 4242 4242 4242`), jouer devis → séquestre →
  libération, vérifier la réconciliation des montants (F-012/013). Redéployer `stripe-webhook`/`escrow-webhook`
  sur le staging avec les clés test + configurer l'endpoint webhook Stripe test.
- **Charge** : 100/300/500 utilisateurs simulés (k6/Artillery) contre le staging.

---

## Sécurité (rappels)
- Jamais de secret (mot de passe DB, service_role, `sbp_…`, clés Stripe secrètes) dans le chat ni dans un
  fichier versionné. Les `.env.*` réels restent locaux (gitignore).
- Le staging n'a QUE de fausses données. On ne copie **jamais** les données clients de la prod.
