# REMAINING_WORK — Runbook de clôture d'audit (MineGrid, Fable 5)

> État : le code de sécurité critique est **fait + prouvé + committé** (2 P0 + P1 fraude/argent).
> Ce document transforme chaque point RESTANT en tâche concrète. Rien ici n'est un « trou ouvert »
> exploitable aujourd'hui ; ce sont des chantiers de robustesse/gouvernance ou des décisions produit.

---

## 0. À FAIRE MAINTENANT
- [x] **Appliquer `.audit/APPLY_IN_PROD.sql`** (Supabase SQL Editor → Run) — **FAIT le 2026-07-16 ✅**.
      Contenait p3-restrict + p8→p24 : verrous argent/fraude/revenus + index perf (p16) + quota IA (p17)
      + RPC suppression compte RGPD (p18) + admin membres (p19) + RPC d'agrégation perf accueil/stock (p20/p21)
      + optimisation RLS initplan (p22) + anti-spam devis/contact (p23) + quota tenders-ai (p24).
      Recommandé : relancer `.audit/evidence/prod_rls_verification.sql` pour re-constater l'état durci.
- [ ] **Déployer 3 Edge Functions** (quota IA + RGPD + quota AO, code prêt+revu) :
      `supabase functions deploy ai-proxy`, `supabase functions deploy delete-account`,
      `supabase functions deploy tenders-ai` (via CLI + jeton, cf. plus haut ; à TESTER en staging).
- [ ] **Créer un code promo** (jamais dans le front) : `insert into public.promo_codes (...)` (cf. p15).
- [ ] Supprimer la fonction morte **`hyper-service`** (dashboard → Edge Functions → ⋯ → Delete).

## 0bis. DÉJÀ CORRIGÉ + PROUVÉ cette session (rappel)
2 P0 argent (commission/payment), P1 fraude inspection, revenus (p14 + code promo p15), quota IA (p17),
RGPD suppression compte (p18), perf index (p16) ; ~15 façades UI (vitrine, messages, publication, documents,
devis, page vendeur, Pro/Premium, Services). Détail : FINDINGS.md + git log branche fix/audit-remediation.

**6 refontes 🟠 (par ordre, chacune prouvée + committée) :**
1. Accueil — RPC d'agrégation `machine_category_counts` (p20) au lieu de 5000 lignes rapatriées.
2. Widget Stock — RPC `machine_engagement_counts` (p21) au lieu de 3×50 000 lignes.
3. `WidgetRenderer` — `React.memo` + comparateur config (plus de re-rendu de tout l'arbre au polling).
4. RLS — `auth.uid()` → `(select auth.uid())` sur toutes les policies (p22, initplan Supabase), prouvé
   à comportement identique + idempotent.
5. Anti-spam — trigger throttle par e-mail sur `quote_requests`/`contact_messages` (p23) + quota
   quotidien tenders-ai par utilisateur (p24). 16/16 harnais CI verts.
6. Vérité cosmétique — suppression du faux rang mort (3/12), `#demo-entreprise` non exposé en prod
   sans code, bandeau « données de démonstration » sur les appels d'offres (prouvé en live).

---

## 1. F-002 — Versionner la baseline (`0000_baseline`)  [P1 gouvernance]
**Problème** : le schéma + la RLS de base vivent dans ~50 scripts `sql/` appliqués à la main. Un `supabase db push`
sur base neuve NE reconstruit PAS la prod. Risque : DR / nouvel environnement / CI sans schéma.
**Pourquoi je ne l'ai pas fait en aveugle** : re-concaténer `sql/` risque de DIVERGER de la prod (la prod a
évolué manuellement pendant des mois). La source fiable = le schéma RÉEL de la prod.
**Procédure fiable (à faire par toi, avec le CLI lié)** :
```bash
# 1) dump du schéma RÉEL de prod (structure seule, pas les données)
npx supabase db dump --project-ref tnfbggrftmtxpgbcwqzo --schema public -f supabase/migrations/00000000000000_baseline.sql
# 2) relire le fichier, retirer les GRANT d'écriture résiduels sur les tables argent
#    (payment_records/commission_records/inspection_reports) s'ils réapparaissent
# 3) commit ; désormais `supabase db reset` reproduit la prod à l'identique
```
**Critère de succès** : `supabase db reset` sur une base locale crée TOUT le schéma + la RLS sans erreur.

## 2. F-004 — Collisions de schéma  [P1, lié à F-002]
`inspection_requests`, `inspection_reports`, `customs_cases`, `transport_requests` sont définies 2× (nextgen/0001
vs transaction_platform_extended.sql), colonnes différentes.
**Décision** : la PROD utilise la variante **transaction_platform** (vérifié : inspection_reports a `mechanic_id`).
→ Canonique = transaction_platform. Action : dans `sql/nextgen/0001`, SUPPRIMER les `create table`/policies de
inspection_requests/reports/media qui collisionnent, garder uniquement les tables NON conflictuelles
(trust_profiles, verifications, inspectors, machine_history). Documenter le choix en tête de fichier.
*(Devient trivial une fois la baseline dumpée depuis la prod — le dump n'a qu'UNE définition par table.)*

## 3. Escrow / PSP — à traiter AVANT d'armer les paiements  [F-012/F-013, latent]
Le flux escrow n'est PAS armé (`create-escrow` non déployée, aucun PSP — cf. escrowService.ts:48). Rien à corriger
tant qu'il n'est pas armé. Le jour de l'armement :
- [ ] **F-012** étendre le contrat webhook PSP pour porter `amount`+`currency`, et dans escrow-webhook comparer
      strictement à `escrow_transactions.amount`/`currency` avant `funded`/`released` (rejeter + logguer sinon).
- [ ] **F-013** appliquer les `release_conditions` (inspection_report_id + livraison) CÔTÉ SERVEUR avant tout
      `released` — ne pas se fier au graphe d'arêtes seul (retirer/garder `disputed→released` selon la règle métier).
- [ ] Écrire `create-escrow` (Edge) selon le contrat du PSP choisi.
- [ ] Déployer les Edge DURCIES du repo (escrow-webhook, stripe-webhook, create-payment) + tester en STAGING
      (idempotence : rejouer un webhook 2× ; réconciliation montant ; double funded/released).

## 4. Paiement Stripe — à armer  [F-016, intentionnel]
`create-payment` (repo, non déployée) : le jour de l'armement, `supabase functions deploy create-payment` +
déployer `stripe-webhook` durcie + appliquer p13 (déjà dans le bundle) + tester en staging.

## 5. F-005 — PII trust_profiles/inspectors exposées à anon  [P2, latent]
Tables ABSENTES en prod (couche trust non déployée). À faire au déploiement de cette couche :
```sql
-- exposer à anon uniquement les colonnes « badge », pas user_id/legal_name/country
revoke select on public.trust_profiles from anon;
grant  select (id, trust_score, trust_tier, entity_type) on public.trust_profiles to anon;
```
(adapter les noms de colonnes réels). Idem `inspectors` (retirer user_id de l'accès anon).

## 6. F-006b — Inserts anon `with check(true)`  [P2]
`quote_requests`, `contact_messages`, `machine_views` : insert anonyme VOULU (formulaires publics). Le risque =
**spam/spoofing**, pas une fuite. Mitigation = **rate-limiting** (pas de la RLS) :
- [ ] activer un rate-limit au niveau edge/gateway (Cloudflare/Supabase) sur ces endpoints, ou un hCaptcha sur
      le formulaire de contact et la demande de devis.

## 7. F-008 — Vulnérabilités npm (dev)  [P2]
14 vulns, **toutes en devDependencies/build** (vite, ws, yaml…), HORS bundle prod livré. Non urgent :
```bash
npm audit fix      # non-breaking ; puis re-jouer : npx tsc --noEmit && npm test && npm run build
```
Ne PAS faire `npm audit fix --force` sans tester (montées de version cassantes).

## 8. F-009 — Actions CI non épinglées sur SHA  [P3]
`actions/checkout@v4`, `actions/setup-node@v4` → épingler sur le commit SHA complet (aller sur la page GitHub
de chaque action, copier le SHA du tag v4, remplacer `@v4` par `@<sha>` dans `.github/workflows/*.yml`).

## 9. F-007 — Bundle  [P2, quasi résolu]
`vite.config.ts` a DÉJÀ `manualChunks` (react-vendor/supabase/charts/maps/grid/stripe) et les gros modules
(exceljs 940 kB, EnterpriseDashboardShell 596 kB) sont déjà en chunks séparés chargés à la demande (pas dans le
bundle initial ~394 kB). Rien de bloquant. Optionnel : lazy-import d'exceljs au clic « Exporter ».

---

## 10. Phases non exécutables en local (à faire sur STAGING avec secrets)
- **Phase 3** — parcours E2E réels (devis→dossier→inspection→escrow→clôture) avec 2 entreprises.
- **Phase 5** — charge 100/300/500 utilisateurs (k6/Artillery sur staging), mesurer p95/p99, requêtes lentes,
      index manquants (EXPLAIN ANALYZE), coûts.
- **Résilience** — pannes externes (Stripe/email/monitor) : timeouts, retries, idempotence.

## Décision de production
**GO SOUS CONDITIONS** : appliquer le §0, garder les flux paiement/escrow NON armés jusqu'au §3-4 (staging),
traiter le §1 (baseline) avant tout nouvel environnement. Aucun P0 ouvert une fois `APPLY_IN_PROD.sql` passé.
