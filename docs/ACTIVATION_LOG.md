# Journal d'activation MineGrid — phase « valeur de l'existant »

> Programme post-validation : on **active / connecte / alimente** les actifs existants (aucun nouveau module).
> Un livrable par priorité : actif · état avant → après · impacts · risques · rollback.

---

## Priorité 1 — PONT ESCROW ✅ (code livré)

**Actif concerné :** les deux systèmes d'escrow déjà présents — `escrow_transactions` (système A, PSP/Stripe, alimente le trust) et `payment_records` (système B, miroir dossier). **Aucun nouveau module** : on relie l'existant.

**État AVANT**
- `escrow_transactions` ignore le dossier (pas de `transaction_case_id`).
- `payment_records` ne touche jamais d'argent (`awaiting_partner`) et n'est jamais relié à l'escrow réel.
- Une « chaîne validée » qui ne déclenche **aucun paiement** ni **aucun recalcul de trust**.

**État APRÈS** (`sql/2026-06_escrow_bridge.sql`)
- Lien bidirectionnel : `escrow_transactions.transaction_case_id` + `payment_records.escrow_transaction_id` (nullables, compat totale).
- **Propagation A→B** par trigger `trg_escrow_sync_payment` (SECURITY DEFINER) : l'état réel de l'escrow (`created/funded/…/released`) est reflété dans `payment_records.status` (`awaiting_partner/held/released/…`) + event `escrow.synced` dans `transaction_events`.
- RPC `open_case_escrow(case)` : ouvre un escrow **statut `created` = NON financé** (aucun paiement simulé) ; RPC `link_case_to_escrow(case, escrow)` : rattache un escrow réel existant. Toutes deux `SECURITY DEFINER`, idempotentes, avec contrôle de partie prenante.
- Cockpit financier : reconnaît désormais `held` et `disputed` (litige à traiter) via `buildPaymentCaseSignals`.

**Mappings d'état (escrow → dossier)** : `created→awaiting_partner` · `funded/inspection_passed/delivered→held` · `released→released` · `refunded→refunded` · `disputed→disputed` · `cancelled→cancelled`.

**Impacts**
- **Métier** : le financier voit l'escrow réel d'un dossier (fonds séquestrés / litige) et peut agir ; l'inspection débloque la libération (chaîne `inspection_passed→delivered→released`).
- **Business** : rend exécutable l'argument *« on ne paie qu'après inspection »* (frais escrow = source de revenu transactionnel) ; relie la chaîne validée à de l'argent réel.
- **Investisseur** : un escrow de dossier **alimente le trust score** (`recompute-trust-score` compte `released`/`disputed` sur `escrow_transactions`) → démarre le flywheel confiance ; gouvernance préservée (écriture argent **toujours** côté serveur/PSP).

**Garde-fous / anti-façade**
- `escrow_transactions` reste **révoqué en écriture** côté client (RLS 0002 inchangée) ; seul le PSP (escrow-webhook, service_role) déplace l'argent.
- `open_case_escrow` exige acheteur + montant + machine réels (`buyer_required`/`amount_required`/`machine_required`) — jamais d'escrow fictif.
- Idempotent (un escrow non terminal par dossier ; trigger sans bruit si déjà synchronisé).

**Risques**
- Divergence de devise (escrow EUR par défaut vs dossier MAD) : `open_case_escrow` force la devise du dossier ; à surveiller si un PSP impose EUR.
- Le miroir ne crée jamais d'argent : tant qu'aucun PSP réel n'émet `funded`, l'escrow reste `created/awaiting_partner` (comportement voulu).

**Rollback**
- `git revert` des 2 commits `feat(escrow bridge)`, ou en base : `drop trigger if exists trg_escrow_sync_payment on public.escrow_transactions;` + `drop function if exists public.open_case_escrow, public.link_case_to_escrow, public._tc_sync_payment_from_escrow, public._escrow_status_to_payment;` (les colonnes nullables peuvent rester sans effet).

**Déploiement** : `SQL_A_APPLIQUER/7_pont_escrow.sql` (idempotent). Validation : tsc + 254 tests + build OK.
