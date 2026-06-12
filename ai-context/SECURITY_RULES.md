# SECURITY_RULES.md

## Règles de sécurité pour agents IA

Les agents IA ne doivent jamais :

- créer ou exposer une clé API ;
- afficher un secret dans les logs ;
- modifier une politique d’accès sans validation ;
- désactiver l’authentification ;
- désactiver un test de sécurité ;
- contourner une restriction ;
- ajouter une dépendance inconnue pour une fonctionnalité sensible.

## Zones nécessitant validation humaine

- Authentification.
- Autorisation.
- Paiement.
- Données personnelles.
- Accès administrateur.
- Suppression de données.
- Migration de base de données.
- Webhooks externes.
- Stockage de fichiers.

## Checklist sécurité PR

- [ ] Aucun secret exposé.
- [ ] Permissions respectées.
- [ ] Entrées utilisateur validées.
- [ ] Pas d’injection évidente.
- [ ] Pas de logs sensibles.
- [ ] Pas de dépendance suspecte.
- [ ] Rollback possible.
