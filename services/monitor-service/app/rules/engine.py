"""
Rules engine V1 — computes equipment needs from project metadata.

No LLM involved. Uses configurable rules from equipment_rules.json.
Applies: base quantities * phase_multiplier * budget_multiplier.
"""
from __future__ import annotations
import json
import math
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from functools import lru_cache

RULES_PATH = Path(__file__).parent / "equipment_rules.json"


@lru_cache
def load_rules() -> dict:
    with open(RULES_PATH) as f:
        return json.load(f)


@dataclass
class EquipmentEstimate:
    category: str
    qty_min: int
    qty_max: int
    confidence: Decimal
    rationale: str
    estimated: bool = True


def _get_budget_multiplier(budget_usd: Decimal | None, rules: dict) -> float:
    if budget_usd is None:
        return 1.0

    budget_float = float(budget_usd)
    buckets = rules["budget_buckets"]

    for bucket_name in ["small", "medium", "large", "mega"]:
        bucket = buckets[bucket_name]
        max_val = bucket["max_usd"]
        if max_val is None or budget_float <= max_val:
            return bucket["multiplier"]

    return 1.0


def _get_phase_multiplier(phase: str, rules: dict) -> float:
    return rules["phase_multipliers"].get(phase, 0.5)


def compute_equipment_needs(
    project_type: str,
    phase: str,
    budget_usd: Decimal | None = None,
) -> list[EquipmentEstimate]:
    """
    Compute estimated equipment needs for a project.

    Args:
        project_type: mine, road, port, rail, dam, industrial_zone, energy
        phase: study, financing, tender, construction, ops
        budget_usd: optional budget in USD

    Returns:
        List of EquipmentEstimate for 10 categories.
    """
    rules = load_rules()

    type_rules = rules["project_types"].get(project_type, rules["default_type"])
    phase_mult = _get_phase_multiplier(phase, rules)
    budget_mult = _get_budget_multiplier(budget_usd, rules)

    combined = phase_mult * budget_mult
    # Constaté le 2026-10-01 (test test_study_phase_near_zero, en échec depuis
    # son écriture) : la phase « study » a un multiplicateur 0.0 dans
    # equipment_rules.json — aucun engin à ce stade. L'ancien code le remplaçait
    # par 0.01 puis arrondissait au-dessus (ceil) : CHAQUE catégorie valait
    # alors 0–1, soit 10 lignes « [estimated] » inventées pour un projet encore
    # à l'étude (GET /projects/{id} les servait comme besoins estimés).
    # Désormais : liste toujours complète (10 catégories), quantités à 0 ; la
    # route filtre `qty_max > 0` et n'affiche donc aucune estimation fictive.
    no_equipment_expected = combined == 0

    estimates: list[EquipmentEstimate] = []

    for category, base in type_rules.items():
        base_min = base["base_min"]
        base_max = base["base_max"]

        if no_equipment_expected:
            qty_min, qty_max = 0, 0
        else:
            qty_min = max(0, math.floor(base_min * combined))
            qty_max = max(qty_min, math.ceil(base_max * combined))

        # Confidence based on how much info we have
        conf = Decimal("0.5")
        if budget_usd is not None:
            conf += Decimal("0.15")
        if phase in ("construction", "ops"):
            conf += Decimal("0.1")
        if project_type in rules["project_types"]:
            conf += Decimal("0.1")
        conf = min(conf, Decimal("0.85"))

        budget_label = ""
        if budget_usd is not None:
            budget_label = f", budget ${float(budget_usd)/1e6:.0f}M"

        rationale = (
            f"Estimation V1 (rules engine): {project_type}/{phase}{budget_label}. "
            f"Base [{base_min}-{base_max}] × phase({phase_mult:.1f}) × budget({budget_mult:.1f}) "
            f"= [{qty_min}-{qty_max}]"
        )

        estimates.append(EquipmentEstimate(
            category=category,
            qty_min=qty_min,
            qty_max=qty_max,
            confidence=conf,
            rationale=rationale,
        ))

    return estimates
