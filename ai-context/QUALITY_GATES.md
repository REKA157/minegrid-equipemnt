# QUALITY_GATES.md

## Gates obligatoires avant merge

Une PR générée ou modifiée par agent IA doit passer :

- [ ] Build.
- [ ] Tests unitaires.
- [ ] Lint.
- [ ] Revue humaine.
- [ ] Résumé technique.
- [ ] Liste des fichiers modifiés.
- [ ] Risques connus.
- [ ] Absence de secrets.

## Gates supplémentaires selon le type de tâche

### UI

- [ ] Capture écran.
- [ ] Responsive vérifié.
- [ ] Aucun changement visuel non demandé.

### Backend

- [ ] Tests endpoint.
- [ ] Gestion erreurs.
- [ ] Validation inputs.
- [ ] Pas de changement DB non documenté.

### IA / LLM

- [ ] Prompt versionné.
- [ ] Cas de test.
- [ ] Evals.
- [ ] Comportements d’échec prévus.

### Sécurité

- [ ] Validation humaine senior.
- [ ] Scan dépendances.
- [ ] Revue permissions.
