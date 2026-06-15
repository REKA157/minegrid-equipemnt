# Rapport de validation fonctionnelle — Chaîne transactionnelle MineGrid

**Date :** 2026-06-15
**Environnement :** Supabase production (`Minegrid-Equipement` / `main`, organisation `contact@minegrid.ma`)
**Périmètre :** migrations `2026-06_transaction_chain_write_side.sql` + `2026-06_transaction_participant_assign.sql`
**Méthode :**
1. Sonde automatique via l'API REST avec la clé **`anon`** (existence tables + RPC, sans toucher aux données).
2. Diagnostic **lecture seule** exécuté dans le SQL Editor (rôle `postgres`, visibilité complète, bypass RLS) — `SQL_A_APPLIQUER/6_validation_lecture_seule.sql`.

> Limite assumée : la clé `anon` seule ne permet pas de prouver RLS/données (réponses `[]` ambiguës). Les points 4, 5, 6 sont donc établis par le diagnostic admin ci-dessous, pas par inférence.

---

## Synthèse

| # | Vérification demandée | Statut | Preuve |
|---|------------------------|--------|--------|
| 1 | Migrations réellement appliquées | ✅ **VALIDÉ** | 8 RPC des 2 migrations présentes et exécutables |
| 2 | Tables concernées existent | ✅ **VALIDÉ** | 8/8 tables présentes (REST sans 404) + comptes lus |
| 3 | RPC/fonctions existent | ✅ **VALIDÉ** | 10/10 fonctions présentes, **toutes `SECURITY DEFINER`** |
| 4 | RLS actives | ✅ **VALIDÉ** | `relrowsecurity = ACTIVE` sur les 8 tables, policies > 0 |
| 5 | Données créées présentes en base | ✅ **VALIDÉ** | `transaction_cases=1`, `participants=2`, `events=3`, `inspection_requests=1` |
| 6 | Test bout-en-bout | 🟡 **PARTIEL** | `dossier → participant → inspection → events` peuplé et lié ; financement/transport/douane/escrow **non encore déclenchés** (0 ligne) |
| 7 | Rapport de validation | ✅ Ce document | — |

---

## Détail des preuves (diagnostic admin)

### Point 4 — RLS active (8/8 tables)

| Table | RLS | Policies |
|-------|-----|----------|
| transaction_cases | ACTIVE | 4 |
| transaction_participants | ACTIVE | 3 |
| transaction_events | ACTIVE | 2 |
| inspection_requests | ACTIVE | 6 |
| payment_records | ACTIVE | 5 |
| financing_requests | ACTIVE | 6 |
| transport_requests | ACTIVE | 6 |
| customs_cases | ACTIVE | 6 |

### Points 1 & 3 — Fonctions présentes et sécurisées (10/10, toutes `SECURITY DEFINER`)

`create_inspection_step`, `create_payment_step`, `create_financing_step`, `create_transport_step`,
`create_customs_step`, `advance_transaction_case_step`, `assign_transaction_partner`,
`revoke_transaction_partner`, `_tc_is_party`, `_tc_participant_of_role`.

### Point 5 — Données réellement en base

| Table | Lignes |
|-------|--------|
| transaction_cases | 1 |
| transaction_participants | 2 |
| transaction_events | 3 |
| inspection_requests | 1 |
| payment_records | 0 |
| financing_requests | 0 |
| transport_requests | 0 |
| customs_cases | 0 |

### Point 6 — Chaîne du dernier dossier (`c0762334-…`)

| Maillon | Lignes | Statut |
|---------|--------|--------|
| participants | 2 | ✅ réel (seller + mechanic) |
| inspections | 1 | ✅ réel, lié au dossier |
| événements | 3 | ✅ timeline alimentée |
| financements | 0 | ⏳ non déclenché |
| transports | 0 | ⏳ non déclenché |
| paiements (escrow) | 0 | ⏳ non déclenché |
| douanes | 0 | ⏳ non déclenché |

---

## Conclusion

L'**infrastructure** de la chaîne transactionnelle est **réellement déployée et conforme** sur Supabase production :
les 8 tables existent, la **RLS est active partout**, les **10 fonctions sont présentes et en `SECURITY DEFINER`**,
et le write-side **crée de vraies lignes en base** (preuve : 1 inspection + 2 participants + 3 événements liés au dossier,
non une façade UI).

Le **bout-en-bout** est prouvé sur le maillon **dossier → participant → inspection → événements**.
Les maillons **financement / transport / douane / escrow** sont **structurellement prêts** (RPC présentes, identiques au
maillon inspection déjà prouvé) mais **pas encore exercés avec données** — il suffit de cliquer les 4 boutons correspondants
sur la page dossier, puis de relancer le diagnostic, pour les passer en ✅.

**Verdict :** chaîne transactionnelle **validée au niveau infrastructure (points 1-5)** ; **bout-en-bout validé pour
l'inspection**, complétion immédiate pour les 4 autres maillons par déclenchement manuel.

### Reste à exécuter pour clôturer le point 6
Sur le dossier de test, cliquer : *Demander un financement*, *Demander un transport*, *Ouvrir un dossier douane*,
*Mettre en escrow* → relancer `6_validation_lecture_seule.sql` → les 4 compteurs `CHAINE` passent à ≥ 1.
