# Politique d’accès des agents IA

## Principe

Un agent IA reçoit uniquement les accès nécessaires à sa mission.

## Accès autorisés par défaut

- Lecture du dépôt.
- Écriture sur branche dédiée.
- Création de PR.
- Exécution tests en sandbox.
- Lecture documentation projet.

## Accès interdits par défaut

- Écriture sur `main`.
- Déploiement production.
- Lecture secrets.
- Accès base de données production.
- Suppression massive.
- Modification permissions.
- Modification facturation.

## Branches

Format recommandé :

```text
agent/frontend-nom-ticket
agent/backend-nom-ticket
agent/test-nom-ticket
agent/review-nom-ticket
```

## Logs

Toute session agent doit produire :
- objectif ;
- actions ;
- fichiers modifiés ;
- commandes lancées ;
- erreurs ;
- résultat.
