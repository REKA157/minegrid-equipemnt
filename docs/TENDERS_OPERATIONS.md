# Module Appels d'offres — opérations (réservé à l'exploitant)

Ces procédures étaient affichées dans l'interface (Paramètres → « Configuration
technique ») : elles s'adressent à l'EXPLOITANT de la plateforme, pas aux clients,
et ont donc été retirées du produit (2026-07-20) pour vivre ici.

## Activer l'IA réelle (analyse DCE, génération de documents)

1. Créer une clé API sur `console.anthropic.com` et l'enregistrer comme **secret
   Supabase** (jamais dans le code, jamais dans un chat) :
   ```powershell
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
   ```
2. Déployer la fonction serveur (incluse dans le projet) :
   ```powershell
   npx supabase functions deploy tenders-ai --project-ref <ref>
   ```
3. Côté application (`.env.local` / `.env.staging`), puis redémarrer :
   ```
   VITE_TENDERS_AI_URL=supabase
   ```

⚠ En production, ajouter le secret `TENDERS_AI_REQUIRE_AUTH=true` pour réserver
l'IA aux utilisateurs connectés (protège le crédit API). En cas de panne ou de
quota, l'application retombe automatiquement sur la simulation — personne n'est
bloqué.

## Activer le partage d'équipe (dossiers par société)

1. Appliquer les migrations (éditor-safe, prouvées en Docker — 10 contre-cas) :
   - `supabase/migrations/20260708120100_teamA_backfill_orgs.sql` (une société
     par abonné `pro_clients`)
   - `supabase/migrations/20260708160000_teamE_tender_workspace.sql` (espace
     `tender_workspaces` + RPC `get/save_my_tender_workspace`, RLS par société)
2. Côté application, puis redémarrer :
   ```
   VITE_TENDERS_SHARED=true
   ```

Le partage réutilise le système d'équipe (invitations, rôles, RLS). Chaque
salarié doit être membre de la société et connecté. Sans connexion/société,
l'app retombe automatiquement en mode local (et n'écrit jamais).

État : ACTIVÉ sur le staging le 2026-07-20 (vérifié de bout en bout).
