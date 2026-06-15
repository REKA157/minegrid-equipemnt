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
| 5 | Données créées présentes en base | ✅ **VALIDÉ** | toutes les tables de la chaîne contiennent ≥ 1 ligne réelle |
| 6 | Test bout-en-bout | ✅ **VALIDÉ** | chaîne complète peuplée et liée au dossier : inspection + financement + transport + douane + escrow + 7 événements |
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
| transaction_events | 7 |
| inspection_requests | 1 |
| payment_records | 1 |
| financing_requests | 1 |
| transport_requests | 1 |
| customs_cases | 1 |

### Point 6 — Chaîne du dernier dossier (`c0762334-…`) — COMPLÈTE

| Maillon | Lignes | Statut |
|---------|--------|--------|
| participants | 2 | ✅ réel (seller + mechanic) |
| inspections | 1 | ✅ réel, lié au dossier |
| financements | 1 | ✅ réel, lié au dossier |
| transports | 1 | ✅ réel, lié au dossier |
| paiements (escrow) | 1 | ✅ réel (`awaiting_partner`, aucun paiement simulé) |
| douanes | 1 | ✅ réel, lié au dossier |
| événements | 7 | ✅ timeline complète (1 par étape : inspection, financement, transport, douane, escrow + création) |

---

## Conclusion

La chaîne transactionnelle MineGrid est **réellement déployée, conforme et fonctionnelle de bout en bout** sur
Supabase production :

- **Infrastructure** : les 8 tables existent, la **RLS est active partout**, les **10 fonctions sont présentes et toutes
  en `SECURITY DEFINER`** (écriture contrôlée serveur).
- **Bout-en-bout** : un dossier unique porte désormais une chaîne **complète et liée** —
  `dossier → 2 participants → inspection → financement → transport → douane → escrow`, avec **7 événements d'audit**
  (un par étape). Toutes les lignes sont **réelles en base** (vérifiées en lecture admin, RLS bypassée), **pas une
  façade UI**. L'escrow est posé en `awaiting_partner` : **aucun paiement n'est simulé** (règle anti-façade respectée).

**Verdict : chaîne transactionnelle VALIDÉE — 7/7 points confirmés.** Les écritures sensibles passent exclusivement
par des RPC `SECURITY DEFINER` contrôlées, et la chaîne produit de vraies données traçables côté base.

### Reproductibilité
Diagnostic rejouable à tout moment : `SQL_A_APPLIQUER/6_validation_lecture_seule.sql` (lecture seule, rôle `postgres`).
