# Kit opérationnel — Équipe IA-native avec agents IA

## Objectif

Ce kit sert à organiser une équipe de développement moderne où les humains, le manager et plusieurs couches d’agents IA travaillent ensemble pour accélérer la production tout en maintenant une qualité élevée.

L’objectif n’est pas simplement d’utiliser l’IA comme assistant de code, mais de créer une organisation capable de :

- transformer les besoins métier en tickets exploitables par agents IA ;
- déléguer les tâches aux bons agents ;
- contrôler la qualité par tests, revues et métriques ;
- réduire les délais de production ;
- éviter la dette technique générée par l’IA ;
- capitaliser sur les erreurs pour améliorer le système.

## Installation rapide dans un dépôt

Copier ces fichiers à la racine du projet :

```text
AGENTS.md
/ai-context
/prompts
/governance
/templates
/dashboards
/scripts
/.github
```

Puis adapter :

1. `ai-context/PROJECT_OVERVIEW.md`
2. `ai-context/ARCHITECTURE.md`
3. `ai-context/TEST_COMMANDS.md`
4. `ai-context/SECURITY_RULES.md`
5. `.github/workflows/agent-quality.yml`

## Règle d’or

Aucune tâche IA ne doit être acceptée sans preuve vérifiable :

- build passé ;
- tests passés ;
- lint passé ;
- résumé technique ;
- risques documentés ;
- validation humaine pour les zones sensibles.

## Organisation cible

```text
Manager / Product Owner IA
│
├── Lead Developer / Architecte
├── AI Workflow Manager
├── Développeurs humains
├── QA / Eval Engineer
├── DevOps / AgentOps
└── Agents IA spécialisés
    ├── Agent Analyste
    ├── Agent Architecte
    ├── Agent Frontend
    ├── Agent Backend
    ├── Agent Test
    ├── Agent Reviewer
    ├── Agent Sécurité
    ├── Agent Documentation
    └── Agent Debug / Incident
```

## Utilisation recommandée

Démarrer par un projet pilote de 30 jours :

1. Choisir un seul dépôt.
2. Installer ce kit.
3. Définir 5 à 10 tickets IA-ready.
4. Confier uniquement des tâches de niveau 1 à 3.
5. Mesurer les PR acceptées, rejetées, corrigées et le temps gagné.
6. Améliorer `AGENTS.md` après chaque sprint.
