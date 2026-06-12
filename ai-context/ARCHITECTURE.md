# ARCHITECTURE.md

## Stack technique

Frontend :
Backend :
Base de données :
Authentification :
Déploiement :
Monitoring :
Tests :

## Structure du dépôt

```text
/src
/components
/pages
/services
/api
/tests
/docs
```

Adapter cette structure au projet réel.

## Principes d’architecture

- Séparer logique métier, UI, accès données et configuration.
- Éviter les composants trop longs.
- Éviter les services monolithiques.
- Centraliser les appels API.
- Préserver la cohérence des noms.
- Documenter toute modification structurelle.

## Zones sensibles

- Authentification :
- Paiement :
- Données personnelles :
- Permissions :
- Stockage :
- Intégrations externes :

## Règles pour agents IA

Un agent ne peut modifier l’architecture que s’il produit :

1. une justification ;
2. les fichiers impactés ;
3. les risques ;
4. une proposition de rollback ;
5. une validation du lead developer.
