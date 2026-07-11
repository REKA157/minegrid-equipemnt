# FINDINGS

> Phase 0 = inventaire. **Aucune anomalie confirmée ici** (une anomalie exige une preuve reproductible,
> produite aux phases 2–4). Les points ci-dessous sont des **PISTES À INSTRUIRE**, pas des findings.

## Compteurs
P0 : 1 (corrigé) · P1 : 4 · P2 : 3 · P3 : 1

---

## F-001 — commission_records écrivable par tout participant [P0] — CORRIGÉ
- MODULE : escrow-paiement · FICHIER : sql/transaction_platform_extended.sql:648-656
- FAIT : policies `commission_records_write`(INSERT)/`_update`(UPDATE) ouvertes à tout participant
  (`can_access_transaction_case`) + GRANT INSERT,UPDATE to authenticated. Un acheteur/vendeur pouvait
  forger une commission (amount/beneficiary arbitraires) ou passer `status='paid'`.
- IMPACT : falsification d'un versement financier affiché dans le cockpit (même classe que payment_records/P3).
- CORRECTION : migration `20260711170000_p8_lock_commission_records.sql` (revoke écritures + drop policies write,
  lecture conservée). PREUVE : p8_commission_lock 7/7 contre-cas, idempotent. COMMIT `9a257135`.
- STATUT : **CORRIGÉ (à appliquer en prod par l'utilisateur)**.

## F-002 — Socle RLS (~30 tables) uniquement dans sql/ manuel, non versionné [P1]
- MODULE : transversal (escrow, chaîne transaction, finance, inspection, trust, métiers, customs, market)
- FAIT : `enable row level security` + policies de base vivent dans sql/transaction_platform_core/extended.sql
  et sql/nextgen/0001-0003, PAS dans supabase/migrations/. Un `supabase db push` sur base neuve ne recrée ni
  tables ni RLS (README l'admet). Risque : env reconstruit / DR / nouvel opérateur = tables SANS RLS.
- NUANCE HONNÊTE : l'utilisateur applique ces scripts à la main en prod → la RLS est PROBABLEMENT présente en
  prod, mais NON GARANTIE/NON REPRODUCTIBLE. Non vérifiable ici (pas d'accès prod).
- CORRECTION : (a) l'utilisateur exécute `.audit/evidence/prod_rls_verification.sql` en prod pour confirmer
  `relrowsecurity=true` sur chaque table ; (b) porter la baseline sql/ en migrations versionnées 0000_baseline
  (chantier dédié, à faire avec preuves — non auto-appliqué en aveugle).
- STATUT : OUVERT (vérif prod + plan de portage).

## F-003 — inspection_reports : le vendeur peut écrire le rapport d'inspection [P1, fraude] — CORRIGÉ
- MODULE : inspection · CONFIRMÉ EN PROD (prod_rls_verification.sql §4 : policies inspection_reports_write/
  _update présentes avec `mechanic_id=auth.uid() OR can_access_transaction_case`, + collision confirmée :
  2 jeux de policies inspection_rep_* et inspection_reports_* coexistent).
- FAIT : un participant du dossier (dont le VENDEUR) pouvait INSÉRER/ÉDITER condition_score/summary →
  inspection favorable fabriquée.
- CONSTAT CODE : le frontend ne fait que LIRE inspection_reports (transactionPlatform.ts:234,
  inspectionService.ts:59 ; widget mécanicien d'écriture PLANIFIÉ/non branché) → révoquer l'écriture
  cliente ne casse rien.
- CORRECTION : migration `20260711190000_p10_lock_inspection_reports.sql` — drop policies write/update
  (2 variantes) + revoke écritures ; lecture conservée ; column-agnostic. PREUVE : p10 5/5 contre-cas,
  idempotent. COMMIT `eb72540e`.
- STATUT : **CORRIGÉ (à appliquer en prod)**.

## F-004 — Collisions de schéma inspection_requests / customs_cases / transport_requests [P1]
- FAIT : chacune définie 2× (nextgen vs extended) avec colonnes/policies différentes, `create table if not exists`
  → selon l'ordre d'exécution, policies sur colonnes inexistantes / état RLS indéterminé.
- CORRECTION : trancher un schéma canonique par table, supprimer le doublon, porter en migration versionnée.
- STATUT : OUVERT.

## F-005 — trust_profiles / inspectors exposent des PII à anon [P2]
- FAIT : `select ... to anon using(true)` expose user_id, legal_name, country (trust_profiles) et user_id/full_name
  (inspectors) au public, au-delà du badge (score/tier).
- CORRECTION : exposer via une VUE limitée aux colonnes badge ; retirer user_id/legal_name de l'accès anon.
- STATUT : OUVERT.

## F-006 — Inserts anon `with check(true)` (quote_requests, contact_messages, machine_views, audit_logs) [P2]
- FAIT : création de leads/messages/vues arbitraires par anon (spam/spoofing). audit_logs INSERT autorise
  actor_id NULL (pollution du journal).
- CORRECTION : rate-limit/captcha côté serveur ; audit_logs → exiger actor_id=auth.uid() ou écriture service_role.
- STATUT : OUVERT.

## F-007 — Bundle > 600 kB sans code-splitting [P2/perf] · 887 warnings lint (code mort) [P3]
- CORRECTION : manualChunks pour gros vendors (exceljs ~940 kB) ; nettoyage progressif des unused vars.
- STATUT : OUVERT (non bloquant).

## F-008 — 14 vulnérabilités npm (2 low / 6 moderate / 6 high) [P2, chaîne d'appro]
- FAIT : `npm audit` = vite (fs.deny bypass, dev), ws (high, transitif dev), yaml (moderate), launch-editor.
  QUASI TOUTES en devDependencies / build-time → PAS dans le bundle de production livré aux clients.
- CORRECTION : `npm audit fix` (non-breaking) puis re-run tsc/lint/vitest/build. NON auto-appliqué
  (protocole : pas de MAJ deps en masse pendant l'audit).
- STATUT : OUVERT (P2, non runtime-prod).

## F-015 — Parité Edge Functions repo ↔ prod : code non versionné + webhooks absents [P1, gouvernance]
- CONSTAT (capture dashboard prod 2026-07-11) : prod déploie 4 fonctions —
  `ai-proxy`, `hyper-service`, `send-contact-email`, `tenders-ai`.
- **`hyper-service` tourne en PROD mais N'EXISTE PAS dans le repo** → code serveur non versionné,
  non auditable, non reproductible (risque de gouvernance / supply-chain interne). À récupérer + versionner.
- `stripe-webhook` et `escrow-webhook` (durcies dans le repo) **ne sont PAS déployées** → les flux
  paiement/escrow ne sont pas armés. QUESTION OUVERTE : comment les abonnements payants sont-ils activés
  aujourd'hui sans stripe-webhook ? (via hyper-service ? écriture manuelle ?) — à clarifier.
- Autres fonctions du repo non déployées : create-payment, send-email, exchange-rates, recompute-trust-score.
- IMPACT : divergence repo↔prod (un déploiement « propre » depuis le repo ne reproduit pas la prod, et
  inversement). Aligne le finding F-002 (versionnement) au niveau Edge.
- CORRECTION : (1) exporter le code de `hyper-service` depuis la prod et le committer ; (2) documenter
  quelles fonctions sont censées être live ; (3) le jour de l'armement paiement/escrow, déployer les
  versions DURCIES du repo (elles incluent déjà les correctifs F-010/F-012/F-013/F-014).
- STATUT : OUVERT (nécessite ton input sur hyper-service + l'activation abonnement).
- MAJ : le frontend n'appelle PAS hyper-service. Il invoque create-payment (StripePaymentForm.tsx:47),
  create-escrow (escrowService.ts:60), send-contact-email, ai-proxy, tenders-ai. Or create-payment
  (présent repo) et create-escrow (ABSENT repo ET prod) NE sont PAS déployées → boutons paiement Stripe
  et « ouvrir séquestre » NON FONCTIONNELS en prod. hyper-service = orphelin (aucun appelant connu).
- RÉSOLU (code hyper-service fourni par l'utilisateur) : c'est un BROUILLON d'envoi d'e-mail jamais
  terminé (`// TODO: branche ici ton provider email`) qui ne fait qu'ÉCHO ({ok:true,received}). AUCUN
  accès base/secret/service_role -> INOFFENSIF, juste du code mort. Reco : SUPPRIMER (nettoyage), non urgent.
- SOUS-FINDING RÉEL (F-016) : create-payment / create-escrow appelées par le front mais non déployées
  -> parcours PAIEMENT et SÉQUESTRE non fonctionnels en prod aujourd'hui (à traiter quand ces flux sont armés ;
  create-escrow est même absente du repo -> à écrire).

## F-009 — Actions GitHub non épinglées sur SHA [P3, chaîne d'appro]
- FAIT : `actions/checkout@v4`, `actions/setup-node@v4` épinglées sur tag majeur, pas sur commit SHA.
- CORRECTION : épingler sur SHA complet. STATUT : OUVERT (P3).

---
## Phase 4 — Intégrité des flux d'argent (webhooks vérifient leur signature = pas de forge)

## F-010 — escrow-webhook : transition non atomique (TOCTOU) [P1, latent] — CORRIGÉ
- FAIT : SELECT status puis UPDATE `.eq('id')` sans garde sur le statut source, pas de rowcount →
  rejeu concurrent at-least-once du PSP = double-fire d'events, voire refunded+released simultanés.
- CORRECTION : `supabase/functions/escrow-webhook/index.ts` — UPDATE conditionnel `.eq('status', tx.status)`
  + `.select()`, no-op idempotent si 0 ligne. (Code Edge/Deno : revu, non runtime-prouvé ici.)
- STATUT : **CORRIGÉ (code)** — à déployer + tester en staging Deno. COMMIT `949d585c`.

## F-011 — finance_applications : auto-scoring (client écrit score/partner_id) [P1, latent] — CORRIGÉ
- FAIT : policy RLS d'UPDATE ne restreint aucune colonne → demandeur pouvait poser score=100 / partner_id.
- CORRECTION : migration `20260711180000_p9_lock_finance_scoring.sql` — privilèges de COLONNE (UPDATE client
  limité aux colonnes non sensibles). PREUVE : p9 6/6 contre-cas, idempotent. COMMIT `949d585c`.
- STATUT : **CORRIGÉ (à appliquer en prod)**.

## F-012 — escrow-webhook : montant/devise PSP jamais réconcilié [P1, latent]
- FAIT : le payload n'a ni amount ni currency ; 'funded'/'released' posés sans comparer à
  escrow_transactions.amount (dérivé de machines.price TEXT, devise défaut 'MAD' vs grille EUR).
- CORRECTION : étendre le contrat webhook (amount+currency), comparer strictement avant transition,
  rejeter + journaliser 'reconciliation_mismatch' sinon. Verrouiller la devise à la création.
- STATUT : OUVERT (contrat PSP + Edge/staging).

## F-013 — escrow : release_conditions / canReleaseFunds jamais appliqués côté serveur [P1, latent]
- FAIT : l'autorité (webhook) libère sur le seul graphe d'arêtes ; `disputed→released` libère sans
  inspection ni livraison ; `canReleaseFunds` (FSM front) jamais exécuté serveur.
- CORRECTION : porter la garde conditions (inspection_report_id + release_conditions) dans l'autorité
  serveur (RPC SECURITY DEFINER) avant tout 'released'. STATUT : OUVERT (Edge/design).

## F-014 — stripe-webhook : pas de dédup event.id + fenêtre recalculée à chaque livraison [P2, à armer]
- FAIT : rejeu Stripe (jusqu'à 3 j) prolonge l'abonnement / ressuscite un abonnement passé 'inactive' ;
  checkout.session.completed n'accorde le plan sans réconcilier amount_total au prix.
- CORRECTION : table `processed_stripe_events(event_id pk)` insérée avant activation ; ne pas reculer
  subscription_end ; garde anti-réactivation d'un 'inactive' ; vérifier amount_total = prix plan.
- STATUT : OUVERT (Edge, à faire avant/juste après armement du webhook Stripe).

---

## Pistes historiques (Phase 0) — voir aussi le corps ci-dessus

## Pistes à instruire (non prouvées)
- **PISTE-1 (Phase 2 / parité)** : ~298 policies RLS + 95 `enable RLS` vivent dans `sql/` manuel, hors
  migrations versionnées. Risque : tables sans RLS en prod. À prouver : lister les tables sensibles
  dont la RLS n'est PAS dans une migration, et vérifier leur état réel (accès prod requis → sinon
  RISQUE RÉSIDUEL).
- **PISTE-2 (Phase 6 / CI)** : le pipeline CI ne joue ni les tests RLS SQL (Docker) ni l'E2E ; creds
  Supabase factices. Un déploiement n'est donc pas bloqué par un échec RLS. À confirmer.
- **PISTE-3 (Phase 2 + fraude)** : modules paiement/escrow/commissions réels → invariants métier
  (double libération escrow, montant/devise, bénéficiaire) à tester en priorité.
- **PISTE-4 (Phase 3)** : chaîne `annonce→…→clôture` à prouver de bout en bout avec 2 entreprises.

## Format d'anomalie (à respecter dès la Phase 1)
```
ID / TITRE / GRAVITÉ / CONFIANCE / PHASE / MODULE / FICHIER / LIGNES /
FAIT OBSERVÉ / SCÉNARIO DE REPRODUCTION / RÉSULTAT OBSERVÉ / RÉSULTAT ATTENDU /
CAUSE RACINE / IMPACT / CORRECTION RECOMMANDÉE / TEST DE NON-RÉGRESSION / PREUVE / STATUT
```
