# Workflow humain + agents IA

## 1. Idée

Le manager formule le besoin métier.

## 2. Analyse

Agent Analyste produit :
- utilisateurs ;
- objectifs ;
- contraintes ;
- questions ouvertes ;
- risques.

## 3. Architecture

Lead Dev + Agent Architecte :
- valident le découpage ;
- identifient les fichiers ;
- fixent les limites.

## 4. Tickets IA-ready

Chaque ticket doit contenir :
- objectif ;
- contexte ;
- fichiers concernés ;
- contraintes ;
- validation attendue ;
- niveau d’autonomie agent.

## 5. Exécution agent

L’agent travaille sur une branche dédiée :

```text
agent/type-ticket-court
```

## 6. Pull Request

La PR doit inclure :
- résumé ;
- fichiers modifiés ;
- tests lancés ;
- risques ;
- captures si UI.

## 7. Revue

Minimum :
- Agent Reviewer ;
- développeur humain ;
- lead si impact architecture ;
- sécurité si zone sensible.

## 8. Merge

Uniquement si les quality gates sont passés.

## 9. Rétrospective

Après chaque sprint :
- PR acceptées ;
- PR rejetées ;
- erreurs récurrentes ;
- règles à ajouter ;
- prompts à améliorer.
