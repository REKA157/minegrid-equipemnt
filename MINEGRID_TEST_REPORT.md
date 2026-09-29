# MINEGRID — RAPPORT DE TESTS

**Date** : 2026-09-29 · 87 fichiers de test, 634 cas verts, build OK, types OK

---

## État mesuré

```
$ npx vitest run
  Test Files  89 passed (89)
  Tests      651 passed (651)

$ npx tsc --noEmit      → 0 erreur (strictNullChecks ACTIF depuis le 2026-09-29)
$ npm run build         → OK, garde-fou de paquet vérifié
```

**Le pourcentage de couverture n'a pas pu être mesuré** : le script `test:coverage` existe dans
`package.json` mais la dépendance `@vitest/coverage-v8` n'est pas installée.

```
$ npx vitest run --coverage
  MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

C'est un constat en soi : **un indicateur de couverture est annoncé et n'est pas mesurable.**
Je n'ai pas installé la dépendance, pour ne pas modifier `package.json` pendant un audit.

À la place, j'ai mesuré ce qui compte davantage : **chaque chemin critique est-il exercé ?**

---

## Couverture par chemin critique

| Chemin | Fichiers de test | Verdict |
|---|---|---|
| AUTH (connexion, mot de passe oublié) | 2 | ⚠️ mince |
| RLS | 6 (+ 18 harnais SQL Docker) | ✅ bon |
| MACHINE (catalogue, publication) | 15 | ✅ bon |
| RFQ / Appels d'offres | 2 | ⚠️ mince |
| **BID (offre fournisseur)** | — | ⛔ **le concept n'existe pas** |
| **AWARD (attribution)** | **0** | ⛔ **aucun test** |
| TRANSACTION | 7 | ⚠️ moyen |
| ESCROW (séquestre) | 9 | ⚠️ tests du code ; **la fonctionnalité n'existe pas en production** |
| UPLOAD | 5 | ⚠️ moyen |
| PAYMENT (abonnement) | 10 | ✅ correct |
| ROLE CHANGES | 11 | ✅ bon — dont le test de persistance ajouté cette semaine |

> **Réserve de méthode** : ce tableau compte les fichiers de test qui *mentionnent* le sujet. Un
> fichier peut mentionner « escrow » sans exercer le séquestre. Le seul chiffre solide ici est le
> **0** d'AWARD. Une mesure de couverture réelle exige la dépendance manquante.

**359 fichiers source n'ont aucun test voisin** sur 437.

---

## Ce que les tests NE couvrent pas, et qui compte

| Angle mort | Pourquoi c'est grave |
|---|---|
| **Concurrence** | Aucun test de double clic, double soumission, double webhook, deux attributions simultanées. Les invariants transactionnels reposent sur des contraintes SQL qui, pour plusieurs d'entre elles, n'existent pas. |
| **Parcours de bout en bout** | Aucun test E2E. Les tests sont unitaires ou de composant ; aucun ne suit devis → dossier → inspection. |
| **Conformité dépôt ↔ production** | Rien ne vérifie que le code déployé est celui du dépôt. C'est ce trou qui a laissé passer `CART-01` (site du 15 août) et `CART-02` (fonction obsolète). |
| **Fonctions serveur** | Les 13 Edge Functions n'ont aucun test automatisé. La divergence entre `tenders-ai` (dépôt) et `renders-ai` (déployée) en est la conséquence directe. |
| **Le harnais SQL saute le socle** | `run_all_proofs.sh` n'applique **jamais** `baseline.sql` et ne couvre que 18 migrations sur 58. Il prouve chaque politique isolément, jamais la séquence complète. |

---

## Tests ajoutés pendant cet audit

| Fichier | Cas | Ce qu'il verrouille |
|---|---|---|
| `src/utils/api/quoteRequests.vendeurFictif.test.ts` | **9** | Aucune demande de devis ne part vers le vendeur fictif que portent 83,7 % des annonces (`SEQ-05`, `CTR-05`) |
| `src/utils/api/verifierDeploiement.test.ts` | **8** | Le site en ligne porte-t-il les correctifs du dépôt ? Et le garde-fou distingue-t-il « retard » de « témoin obsolète » ? (`CART-01`) |

Les deux sont **vérifiés par mutation** : on casse volontairement le code et on constate que le
test échoue. Un test qui n'a jamais échoué ne prouve rien.

> **Correction de ce rapport, 2026-09-29.** Une première version annonçait
> `machineDetailHelpers.test.ts (étendu) +4 cas`. **C'était faux** : ce fichier existe avec
> 17 cas, mais il date d'une séance antérieure et n'a pas été étendu par cet audit. Elle
> annonçait aussi `verifierDeploiement.test.ts` avant que ce fichier n'existe. Les deux lignes
> sont corrigées ci-dessus, et le test manquant a été écrit plutôt qu'effacé du tableau.

Détail dans `MINEGRID_REMEDIATION_ROADMAP.md`.

---

## Tests à écrire en priorité

Par ordre de valeur, chacun formulé comme une assertion vérifiable :

1. **Attribution idempotente** — deux appels simultanés à l'attribution créent exactement un
   dossier. *(Bloqué : l'attribution n'existe pas encore.)*
2. **Clôture opposable** — une soumission envoyée après la date limite est refusée par la base,
   même en appelant l'API directement. *(Bloqué : pas de moteur d'offres.)*
3. **Secret des offres** — le fournisseur A reçoit 0 ligne en interrogeant les offres du
   fournisseur B. *(Bloqué : idem.)*
4. **Montant du dossier non écrit par le client** — un `INSERT` client portant
   `total_amount: 1` est refusé. *(Correctif `p29` écrit, non appliqué — cf. `CTR-01`.)*
5. **Suppression de dossier interdite après paiement** — le `DELETE` échoue sur un dossier en
   statut `payment`. *(Correctif `p29` écrit, non appliqué — cf. `CTR-02`.)*
6. **Prédicat non tautologique** — un courtier du dossier A ne peut pas s'ajouter au dossier B.
   *(Un contre-cas existe déjà : `AUDIT_CONTROL/PREUVE-RLS-01-transaction_participants.sql`.)*
7. **Webhook rejouable** — deux réceptions du même événement Paddle n'activent qu'un abonnement.
