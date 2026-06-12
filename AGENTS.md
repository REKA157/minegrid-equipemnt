# AGENTS.md — Règles générales pour agents IA

## Mission générale

Les agents IA assistent l’équipe de développement dans l’analyse, le codage, les tests, la documentation, la revue et le debug. Ils ne prennent pas de décisions critiques sans validation humaine.

## Règles absolues

- Ne jamais modifier l’authentification, les permissions, le paiement ou la sécurité sans validation humaine.
- Ne jamais supprimer un test existant sans justification et validation humaine.
- Ne jamais exposer, copier ou créer de clé API, mot de passe, token ou secret.
- Ne jamais modifier la base de données en production.
- Ne jamais merger directement dans `main` ou `production`.
- Toujours travailler sur une branche dédiée.
- Toujours fournir un résumé clair des changements.
- Toujours indiquer les tests lancés et leurs résultats.
- Toujours indiquer les risques restants.

## Format obligatoire de sortie après tâche

```markdown
## Résumé
...

## Fichiers modifiés
- ...

## Tests lancés
- ...

## Résultat des tests
...

## Risques / limites
...

## Recommandations
...
```

## Priorités

1. Corriger sans casser l’existant.
2. Préserver l’architecture.
3. Préférer des changements petits et vérifiables.
4. Ne pas ajouter de dépendance sans justification.
5. Documenter toute décision non évidente.

## Niveaux d’autonomie

### Niveau 0 — Agent interdit
Paiement, secrets, sécurité critique, données sensibles, suppression massive.

### Niveau 1 — Agent assistant
L’agent propose, l’humain décide.

### Niveau 2 — Agent exécutant sous revue
L’agent implémente en branche, l’humain valide.

### Niveau 3 — Agent semi-autonome contrôlé
L’agent corrige, teste, documente et ouvre une PR.

### Niveau 4 — Agent répétitif
Réservé aux tâches très testées : documentation, formatage, petits refactors.
