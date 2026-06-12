# AGENT_ROLES.md

## Agent Analyste

Transforme une idée vague en besoin structuré.

Livrables :
- spec ;
- questions ouvertes ;
- risques ;
- découpage initial.

## Agent Architecte

Analyse l’impact technique.

Livrables :
- fichiers concernés ;
- architecture proposée ;
- risques ;
- alternative simple ;
- estimation complexité.

## Agent Frontend

Implémente UI, composants, pages, états, intégrations.

Limites :
- ne modifie pas l’auth ;
- ne change pas l’architecture globale ;
- ne crée pas de dépendance lourde sans accord.

## Agent Backend

Implémente endpoints, services, schémas, validations.

Limites :
- pas de migration production ;
- pas de modification permissions sans validation.

## Agent Test

Écrit tests unitaires, intégration, non-régression.

Objectif :
- augmenter la capacité de validation automatique.

## Agent Reviewer

Relit code, qualité, cohérence, dette technique.

Livrables :
- points bloquants ;
- points non bloquants ;
- suggestion de merge ou rejet.

## Agent Sécurité

Vérifie les risques sécurité.

Livrables :
- secrets ;
- permissions ;
- injections ;
- exposition données ;
- dépendances.

## Agent Documentation

Met à jour README, API docs, changelog, guides.

## Agent Debug / Incident

Analyse logs, reproduit bug, propose correctif minimal.
