"""
Alert rule evaluator.

A rule is a JSON dict with optional keys:
  country:    list[str]       — project.country must be in list (sans accents ni casse)
  type:       list[str]       — project.type must be in list
  phase:      list[str]       — project.phase must be in list
  budget_min: number          — project.budget_usd >= budget_min
  budget_max: number          — project.budget_usd <= budget_max
  keywords:   list[str]       — any keyword must appear in project.title (sans accents ni casse)

All present conditions must match (AND logic).
Missing/empty conditions are ignored.

Example rule:
  {
    "country": ["Senegal", "Ghana"],
    "type": ["mine"],
    "budget_min": 100000000,
    "phase": ["tender", "construction"]
  }
"""
from __future__ import annotations
from app.models import Project
from app.text_fold import fold_text


def evaluate_rule(rule: dict, project: Project) -> bool:
    # Constaté le 2026-10-01 : l'égalité stricte ignorait « Cote d'Ivoire »
    # (Banque mondiale) pour une règle « Côte d'Ivoire » (saisie dans le site).
    # Le pays est désormais comparé sans accents ni casse, des deux côtés, avec
    # la MÊME normalisation que le filtre pays de GET /projects (app/text_fold).
    countries = rule.get("country", [])
    if countries:
        wanted = {fold_text(c) for c in countries if isinstance(c, str)}
        if fold_text(project.country) not in wanted:
            return False

    types = rule.get("type", [])
    if types and (project.type or "") not in types:
        return False

    phases = rule.get("phase", [])
    if phases and (project.phase or "") not in phases:
        return False

    budget_min = rule.get("budget_min")
    if budget_min is not None:
        budget = float(project.budget_usd or 0)
        if budget < float(budget_min):
            return False

    budget_max = rule.get("budget_max")
    if budget_max is not None:
        budget = float(project.budget_usd or 0)
        if budget > float(budget_max):
            return False

    # Même cause que le pays : « equipement » doit trouver « Équipement ».
    # Les mots-clés vides (virgule finale dans la saisie) sont ignorés : avant,
    # un "" contenu dans tout titre faisait correspondre la règle à TOUT projet.
    keywords = [
        fold_text(kw) for kw in (rule.get("keywords") or [])
        if isinstance(kw, str) and fold_text(kw)
    ]
    if keywords:
        title_folded = fold_text(project.title)
        if not any(kw in title_folded for kw in keywords):
            return False

    return True
