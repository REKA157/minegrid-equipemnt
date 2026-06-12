# DELEGATION_MATRIX.md â€” Minegrid Africa

Matrice **tÃ¢che â†’ agent â†’ humain â†’ niveau dâ€™autonomie** (0 = interdit agent seul, 4 = rÃ©pÃ©titif sÃ»r).

RÃ©fÃ©rences : `AGENTS.md`, `ai-context/AGENT_ROLES.md`, `ai-context/SECURITY_RULES.md`.

---

## Matrice gÃ©nÃ©rale

| TÃ¢che | Agent IA | Humain | Niveau |
|-------|:--------:|:------:|:------:|
| Composant UI simple (page, widget isolÃ©) | Oui | Revue | 2 |
| Correction bug front isolÃ© | Oui | Revue | 2 |
| Tests Vitest / pytest | Oui | Revue | 2â€“3 |
| Documentation `ai-context/` | Oui | Revue lÃ©gÃ¨re | 3â€“4 |
| Refactor lÃ©ger (< 200 lignes) | Oui | Revue | 2 |
| Refactor `WidgetRenderer` / `Dashboard.jsx` | IncrÃ©mental | Revue senior | 1â€“2 |
| Migration API (un module `enterpriseApi`) | Oui | Revue | 2 |
| Unification complÃ¨te API (ticket #10) | Assistance | Lead | 1 |
| Architecture systÃ¨me | Assistance | Lead | 1 |
| **Script SQL / RLS / trigger / RPC** | **Proposition** | **Senior exÃ©cute** | **0â€“1 ðŸ”´** |
| **Auth / session Supabase** | **Assistance limitÃ©e** | **Senior** | **0â€“1 ðŸ”´** |
| **ProtectedRoute / permissions** | **ImplÃ©mente branche** | **Revue sÃ©curitÃ©** | **1â€“2 ðŸ”´** |
| **Paiement Stripe / Edge** | **Assistance limitÃ©e** | **Senior** | **0â€“1 ðŸ”´** |
| **Monitor auth / service role** | **Patch proposÃ©** | **Senior** | **0â€“1 ðŸ”´** |
| ExÃ©cution SQL production | **Non** | **DBA / Lead** | **0 ðŸ”´** |
| Rotation secrets / `.env` prod | **Non** | **DevOps** | **0** |
| DonnÃ©es personnelles / export leads | Assistance | DPO / Lead | 1 |
| Suppression massive donnÃ©es | Non | Senior | 0 |
| DÃ©ploiement production | Assistance checklist | DevOps | 1 |
| Audit read-only | Oui | Validation findings | 3 |
| Backfill dossiers (`sql/backfill_*`) | RÃ©daction script | **ExÃ©cution humaine** | **1 ðŸ”´** |

---

## Matrice par ticket backlog (audit)

| # | Ticket | Agent peut | Humain doit | Niveau |
|---|--------|------------|-------------|:------:|
| 1 | RLS `machines` | RÃ©diger script + tests VERIFY | ExÃ©cuter prod, valider policies | **0â€“1 ðŸ”´** |
| 2 | Quote â†’ dossier SQL | Mettre Ã  jour scripts repo, doc ordre | ExÃ©cuter Supabase, tester devis rÃ©el | **1 ðŸ”´** |
| 3 | ProtectedRoute rÃ´les | ImplÃ©menter + tests | Revue sÃ©curitÃ©, matrice rÃ´les mÃ©tier | **1â€“2 ðŸ”´** |
| 4 | Monitor paid fallback | Patch `auth.py` + pytest | Revue + deploy monitor | **1â€“2 ðŸ”´** |
| 5 | Checklist bypass prod | Doc + vÃ©rif CI/env | Valider Vercel / variables prod | 2â€“3 |
| 6 | Tests `quoteRequests` | ImplÃ©menter Vitest | Revue cas limites | 3 |
| 7 | Normaliser `seller_id` | Script SQL + front ciblÃ© | ExÃ©cuter backfill prod | **1 ðŸ”´** |
| 8 | Types Supabase | GÃ©nÃ©rer types, migrer fichiers | Valider build, prioriser tables | 2 |
| 9 | Split WidgetRenderer | PR par famille widgets | Smoke dashboards mÃ©tiers | 2 |
| 10 | Unifier API layer | Plan + 1 domaine pilote | Architecture lead | 1 |

**LÃ©gende ðŸ”´** : validation humaine **obligatoire** avant merge et/ou exÃ©cution prod.

---

## Matrice par chemin de fichier

| Chemin | Modification agent | Condition |
|--------|:------------------:|-----------|
| `src/**` | Oui | Tests + build ; pas auth/paiement sans ðŸ”´ |
| `sql/**` | Proposition uniquement | Jamais exÃ©cution prod agent ; humain ðŸ”´ |
| `supabase/functions/**` | Oui avec revue | Checklist sÃ©curitÃ© ; paiement ðŸ”´ |
| `services/monitor-service/**` | Oui | pytest ; `auth.py` ðŸ”´ |
| `ai-context/**` | Oui | Niveau 3â€“4 |
| `docs/**` | Oui | Niveau 3â€“4 |
| `.env`, secrets | **Non** | **0** |
| `archive/scripts/sql/**` | Lecture seule sauf explicitement demandÃ© | Risque RLS |

---

## RÃ¨gles de dÃ©lÃ©gation

1. **Plus la tÃ¢che est locale, testable et rÃ©versible**, plus lâ€™agent peut Ãªtre autonome (niveau 2â€“3).
2. **Plus la tÃ¢che touche SQL, RLS, auth, paiement ou prod**, plus lâ€™humain doit valider (niveau 0â€“1).
3. Un agent **ne merge jamais** ; il fournit rÃ©sumÃ© format `AGENTS.md` + commandes test exÃ©cutÃ©es.
4. Deux agents consÃ©cutifs recommandÃ©s pour tickets ðŸ”´ : **Architecte/SQL propose â†’ SÃ©curitÃ© revue â†’ Humain exÃ©cute**.
5. Toute PR touchant `transaction_cases` / `quote_requests` inclut lien vers tests manuels ou `VERIFY_LEADS_ET_DOSSIERS.sql`.

---

## Escalade humaine immÃ©diate

- Erreur trigger `transaction_cases_link_quote_request` en prod
- Fuite donnÃ©es / clÃ© service role exposÃ©e
- Bypass monitor actif en prod
- Modification RLS `machines` avec policies `USING (true)`
- Demande utilisateur de mot de passe ou secret

---

## Workflow type ticket #2 (quote â†’ dossier)

```text
Agent SQL     â†’ patch trigger + RPC dans sql/ (PR)
Agent Test    â†’ quoteRequests.test.ts (PR mÃªme branche ou suivante)
Humain Senior â†’ exÃ©cute scripts Supabase staging puis prod
Humain QA     â†’ devis connectÃ© â†’ dossier visible Leads + Mes dossiers
Agent Doc     â†’ met Ã  jour ai-context si ordre dÃ©ploiement change
```
