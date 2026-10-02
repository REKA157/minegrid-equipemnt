"""Besoins d'engins ESTIMÉS ou SIMULÉS : marqués sans ambiguïté (contrats (c) et (a), 2026-10-01).

Constaté le 2026-10-01 : le repli par règles de GET /projects/{id} (type +
phase + budget, aucune lecture de l'appel d'offres) n'était reconnaissable que
par le texte « [estimated] » en tête de `rationale`. Le front devait deviner
avant de les exclure du croisement avec le stock, du score d'opportunité et
de la mention « compatible ». Ils portent désormais estimated=true et
source="estimation" ; le texte est conservé pour les clients actuels.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm.mock_client import MOCK_EQUIPMENT_NEEDS, MockLLMClient
from app.llm.prompts import EQUIPMENT_PROMPT
from app.models import EquipmentNeed, Project
from app.routes import projects as pr
from app.schemas import EquipmentNeedOut


def _projet(**kw):
    p = Project()
    p.id = uuid.uuid4()
    p.title = kw.get("title", "Construction de la route nationale RN1")
    p.fingerprint = "c" * 64
    p.confidence = None
    p.updated_at = datetime(2026, 9, 30)
    p.type = kw.get("type", "road")
    p.phase = kw.get("phase", "construction")
    return p


def _ouvrir(project):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=project)
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    settings = SimpleNamespace(llm_provider="none", llm_api_key="")
    with patch.object(pr, "get_settings", return_value=settings):
        return asyncio.run(pr.get_project(
            project_id=project.id, request=MagicMock(), ai=False, force_ai=False,
            db=db, _paid_ok=True,
        ))


def test_repli_par_regles_marque_estimated_et_source():
    detail = _ouvrir(_projet())
    assert detail.equipment_needs, "le repli par règles doit produire des besoins"
    for need in detail.equipment_needs:
        assert need.estimated is True
        assert need.source == "estimation"
        assert need.rationale.startswith("[estimated]")  # compatibilité conservée
    # Ce que le front reçoit réellement (JSON).
    servis = detail.model_dump(mode="json")["equipment_needs"]
    assert all(n["estimated"] is True and n["source"] == "estimation" for n in servis)


@pytest.mark.parametrize(
    "rationale,estime,source",
    [
        ("[EXTRACT] quantité repérée dans AO autour de « pelle »", False, "extraction"),
        ("[LLM] Excavation lourde requise", False, "ia"),
        ("Saisie manuelle", False, None),
        (None, False, None),
        # Robustesse : le texte seul suffit à marquer une estimation.
        ("[estimated] Estimation règles route", True, "estimation"),
    ],
)
def test_besoin_en_base_origine_deduite_du_texte(rationale, estime, source):
    row = EquipmentNeed()
    row.id = uuid.uuid4()
    row.category = "excavator"
    row.qty_min, row.qty_max = 1, 2
    row.confidence = Decimal("0.84")
    row.rationale = rationale
    row.created_at = datetime(2026, 9, 30)
    out = EquipmentNeedOut.model_validate(row)
    assert out.estimated is estime
    assert out.source == source


def test_drapeau_explicite_sans_prefixe_reste_une_estimation():
    out = EquipmentNeedOut(
        id=uuid.UUID(int=0), category="loader", qty_min=1, qty_max=2,
        confidence=Decimal("0.5"), rationale="règles", created_at=datetime(2026, 9, 30),
        estimated=True,
    )
    assert out.estimated is True and out.source == "estimation"


def test_besoins_reels_en_base_ne_sont_pas_estimes():
    project = _projet()
    row = EquipmentNeed()
    row.id = uuid.uuid4()
    row.category = "excavator"
    row.qty_min, row.qty_max = 3, 4
    row.confidence = Decimal("0.84")
    row.rationale = "[EXTRACT] quantité repérée dans AO autour de « pelle »"
    row.created_at = datetime(2026, 9, 30)
    project.equipment_needs = [row]
    detail = _ouvrir(project)
    assert [(n.estimated, n.source) for n in detail.equipment_needs] == [(False, "extraction")]
    assert detail.equipment_needs[0].simulated is False


# ---------------------------------------------------------------------------
# Relecture du 2026-10-01, REV-5 : besoins déjà écrits en base par le client
# SIMULÉ avant la correction F3.
#
# Constaté le 2026-10-01 (relecture) : avec LLM_PROVIDER=none (valeur par
# défaut de config.py et de .env.example), POST /admin/enrich/run appelait
# MockLLMClient et enregistrait ses 5 besoins fixes (« [LLM] Excavation lourde
# requise pour ce type de projet », pelles 4-8…). Relus sans ?ai=true, ils
# sortaient source="ia", simulated absent : le front les croisait avec le stock
# (« Vous couvrez 1/5 besoin(s) »). Ils sont désormais reconnus à leur
# signature exacte (catégorie + quantités + texte) et marqués simulated=true,
# source="simulation" — champ que le front lit déjà (EquipmentNeed.simulated).
# ---------------------------------------------------------------------------

def _ligne(category, qty_min, qty_max, rationale):
    row = EquipmentNeed()
    row.id = uuid.uuid4()
    row.category = category
    row.qty_min, row.qty_max = qty_min, qty_max
    row.confidence = Decimal("0.7")
    row.rationale = rationale
    row.created_at = datetime(2026, 9, 30)
    return row


def test_la_signature_reconnue_est_celle_que_le_client_simule_renvoie():
    """Source unique : si les réponses du client simulé changent, la
    reconnaissance suit (sinon ce test échoue)."""
    res = asyncio.run(MockLLMClient().complete(EQUIPMENT_PROMPT, "contexte"))
    assert json.loads(res.text)["equipment_needs"] == [dict(n) for n in MOCK_EQUIPMENT_NEEDS]


@pytest.mark.parametrize("besoin", MOCK_EQUIPMENT_NEEDS, ids=lambda b: b["category"])
def test_besoin_ecrit_par_le_client_simule_marque_simule(besoin):
    # Tel qu'enrichment._upsert_equipment_rows l'enregistrait : « [LLM] » + texte.
    row = _ligne(besoin["category"], besoin["qty_min"], besoin["qty_max"], f"[LLM] {besoin['rationale']}")
    out = EquipmentNeedOut.model_validate(row)
    assert out.simulated is True
    assert out.source == "simulation"
    assert out.estimated is False
    servi = out.model_dump(mode="json")
    assert servi["simulated"] is True and servi["source"] == "simulation"


@pytest.mark.parametrize(
    "category,qty_min,qty_max,rationale",
    [
        # Même texte, autres quantités : une vraie IA peut écrire cette phrase.
        ("excavator", 2, 3, "[LLM] Excavation lourde requise pour ce type de projet"),
        # Mêmes quantités, autre texte.
        ("excavator", 4, 8, "[LLM] Excavation lourde pour la plateforme portuaire"),
        # Texte du simulé, autre catégorie.
        ("loader", 4, 8, "[LLM] Excavation lourde requise pour ce type de projet"),
    ],
)
def test_besoin_ia_proche_du_simule_n_est_pas_marque(category, qty_min, qty_max, rationale):
    out = EquipmentNeedOut.model_validate(_ligne(category, qty_min, qty_max, rationale))
    assert out.simulated is False and out.source == "ia"


def test_detail_sans_ia_besoins_simules_en_base_marques():
    project = _projet()
    project.equipment_needs = [
        _ligne(n["category"], n["qty_min"], n["qty_max"], f"[LLM] {n['rationale']}")
        for n in MOCK_EQUIPMENT_NEEDS
    ]
    servis = _ouvrir(project).model_dump(mode="json")["equipment_needs"]
    assert len(servis) == 5
    assert all(n["simulated"] is True and n["source"] == "simulation" for n in servis)
