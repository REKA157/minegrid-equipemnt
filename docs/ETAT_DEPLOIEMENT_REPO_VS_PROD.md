# État de déploiement — repo vs production (correction d'hypothèse)

**Date :** 2026-06-15 · **Méthode :** sonde REST (clé anon) de l'existence réelle des tables sur Supabase prod (`Minegrid-Equipement/main`).

> **Pourquoi ce document** : l'audit stratégique (et la critique adversariale) supposaient la couche « nextgen » (escrow, trust, prix, market) **déployée et à activer**. La sonde prouve le contraire : elle est **codée mais non déployée**. Ce document rétablit les faits pour que la stratégie d'activation repose sur le réel.

## Déployé en production ✅

| Domaine | Tables confirmées |
|---|---|
| **Chaîne transactionnelle** (validée 7/7) | `transaction_cases`, `transaction_participants`, `transaction_events`, `inspection_requests`, `payment_records`, `financing_requests`, `transport_requests`, `customs_cases` |
| Base catalogue | `machines`, `machine_views`, `inspection_reports` |
| RPC | les 10 RPC write-side/partenaire + helpers `_tc_*` (toutes `SECURITY DEFINER`) |

## Codé dans le repo mais NON déployé ❌

| Couche | Tables absentes en prod | Fichier source |
|---|---|---|
| **Escrow (Système A)** | `escrow_transactions`, `escrow_events`, `finance_partners`, `finance_applications` | `sql/nextgen/0002` |
| **Trust Layer** | `trust_profiles`, `verifications` | `sql/nextgen/0001` |
| **Market / Prix Intelligence** | `price_observations`, `market_projects`, `market_alerts`, `platform_events`, `ai_predictions` | `sql/nextgen/0003` |
| Historique | `machine_history` | (divers) |

## Implications pour la stratégie d'activation

1. **Le « pont escrow » (P1) et le « flywheel prix » (P5)** ne reposent pas sur des actifs déployés : leurs tables de base n'existent pas en prod. Le code écrit est correct mais **nécessite d'abord de créer ces tables**.
2. **Le Trust Layer (P2)** n'est pas « partiellement activé » : ses tables (`trust_profiles`, `verifications`) ne sont **pas déployées du tout** (seul `inspection_reports` l'est). L'Edge `recompute-trust-score` existe mais n'a aucune table cible en prod.
3. **Market Intelligence (P3)** : `market_projects`/`price_observations` ne sont pas « vides », elles **n'existent pas**.
4. **Ce qui EST réellement activable aujourd'hui** (sur la chaîne déployée) : CTA « Créer le dossier » (P4, fait), badges sur données déployées (`machine_views`, `inspection_reports`), enrichissement cockpits sur la chaîne.

## Recommandation de déploiement (par risque croissant)

| Étape | Contenu | Risque | Débloque |
|---|---|---|---|
| **A — sûr** | `SQL_A_APPLIQUER/0_prerequis_escrow_prix.sql` (escrow_transactions + escrow_events + price_observations, **tables neuves**) | 🟢 faible | P1 (pont) + P5 (flywheel) |
| B — moyen | `sql/nextgen/0001` (trust) — **mais** vérifier le conflit `inspection_requests`/`customs_cases` avant | 🟠 dette P7 | P2 (trust) |
| C — selon besoin | `sql/nextgen/0003` complet (market, platform_events, ai_predictions) | 🟠 idem customs_cases | P3, observabilité |

**Ordre pour P1+P5 (sûr)** : `0_prerequis_escrow_prix.sql` → `7_pont_escrow.sql` → `8_price_flywheel.sql`.

> Leçon : avant de qualifier un actif d'« à activer », **sonder son existence en prod**. Le repo ≠ la base.
