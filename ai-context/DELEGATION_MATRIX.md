# DELEGATION_MATRIX.md

| Tâche | Agent IA | Humain | Niveau recommandé |
|---|---:|---:|---|
| Composant UI simple | Oui | Revue | 2 |
| Correction bug isolé | Oui | Revue | 2 |
| Écriture tests | Oui | Revue | 2-3 |
| Documentation | Oui | Revue légère | 3 |
| Refactor léger | Oui | Revue senior | 2 |
| Migration large | Assistance | Lead | 1 |
| Architecture système | Assistance | Lead | 1 |
| Authentification | Assistance limitée | Senior | 0-1 |
| Paiement | Assistance limitée | Senior | 0-1 |
| Données sensibles | Assistance limitée | Senior | 0-1 |
| Suppression massive | Non | Senior | 0 |
| Déploiement production | Assistance | DevOps | 1 |
| Analyse logs | Oui | Validation | 2 |
| Génération prompts | Oui | Validation | 2 |
| Evals IA | Oui | QA/Eval | 2 |

## Règle

Plus la tâche est locale, testable et réversible, plus elle peut être confiée à un agent.  
Plus elle est sensible, stratégique ou irréversible, plus elle doit rester humaine.
