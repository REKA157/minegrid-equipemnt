# CODING_RULES.md

## Règles générales

- Produire du code simple, lisible et maintenable.
- Éviter la sur-ingénierie.
- Ne pas ajouter de dépendance sans nécessité.
- Respecter le style existant.
- Ne pas dupliquer la logique métier.
- Ne pas modifier des fichiers non concernés par le ticket.

## Qualité

Chaque changement doit être :

- petit ;
- compréhensible ;
- testable ;
- réversible ;
- documenté si nécessaire.

## Interdictions

- Code mort.
- Logs sensibles.
- Secrets dans le code.
- Fonctions trop longues.
- Refactor massif non demandé.
- Modification de l’architecture sans ticket dédié.
