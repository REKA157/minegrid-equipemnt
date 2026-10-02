"""Client IA simulé : signalé (simulated) et jamais enregistré.

Contrat partagé radar ↔ front du 2026-10-01, point (a). Constaté le
2026-10-01 : sans clé, la fabrique renvoyait EN SILENCE le client simulé ; ses
réponses inventées (besoins « excavator 4-8 », budget 350 M USD, acteurs
« AECOM »…) remontaient au front comme une vraie analyse (« Comparer IA ») et
enrich_project les ENREGISTRAIT en base.

Aucun appel réseau, aucune vraie IA : réglages, base et clients sont remplacés.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm import client as llm_client
from app.llm import enrichment as enr
from app.llm.client import LLMResponse, get_llm_client, llm_is_simulated
from app.llm.mock_client import MockLLMClient
from app.models import EquipmentNeed, Project, ProjectEntity
from app.routes import projects as pr


def _settings(provider="none", key=""):
    return SimpleNamespace(llm_provider=provider, llm_api_key=key, llm_model="gpt-4o-mini")


class _SpyMock(MockLLMClient):
    def __init__(self):
        self.calls = 0

    async def complete(self, system_prompt, user_prompt):
        self.calls += 1
        return await super().complete(system_prompt, user_prompt)


class _FakeRealLLM:
    """Faux client « vraie IA » : rejoue les réponses du client simulé, mais
    se déclare réel. Sert à vérifier que le comportement avec une vraie clé
    est INCHANGÉ (enregistrement des métadonnées et des besoins)."""

    simulated = False

    def __init__(self):
        self.calls = 0
        self._mock = MockLLMClient()

    async def complete(self, system_prompt, user_prompt):
        self.calls += 1
        res = await self._mock.complete(system_prompt, user_prompt)
        return LLMResponse(text=res.text, model="gpt-faux", tokens_used=12)


# ---------------------------------------------------------------------------
# Fabrique
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "provider,key,simule",
    [
        ("none", "", True),
        ("mock", "", True),
        ("openai", "", True),        # fournisseur choisi mais AUCUNE clé
        ("openai", "   ", True),
        ("OpenAI", "cle-factice", False),
        ("openai", "cle-factice", False),
    ],
)
def test_llm_is_simulated(provider, key, simule):
    assert llm_is_simulated(_settings(provider, key)) is simule


def test_fabrique_sans_cle_renvoie_un_client_marque_simule():
    with patch.object(llm_client, "get_settings", return_value=_settings("openai", "")):
        client = get_llm_client()
    assert isinstance(client, MockLLMClient)
    assert client.simulated is True


def test_fabrique_avec_cle_renvoie_le_vrai_client_non_simule():
    # Construction seulement : aucun appel (complete n'est pas invoqué).
    with patch.object(llm_client, "get_settings", return_value=_settings("openai", "cle-factice")):
        client = get_llm_client()
    from app.llm.openai_client import OpenAIClient
    assert isinstance(client, OpenAIClient)
    assert client.simulated is False


# ---------------------------------------------------------------------------
# enrich_project : rien de simulé n'est enregistré
# ---------------------------------------------------------------------------

def _project():
    p = Project()
    p.id = uuid.uuid4()
    p.title = "Travaux de terrassement : 3 pelles hydrauliques"
    p.type = "road"
    p.phase = "construction"
    p.raw = None
    p.source_url = None  # aucune page source à télécharger
    p.budget_usd = None
    p.start_date = None
    p.end_date = None
    p.documents = []
    return p


def _db():
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    result.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    return db


def _ajouts(db, cls):
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], cls)]


def test_enrichissement_simule_n_enregistre_aucune_reponse_inventee():
    project, db, client = _project(), _db(), _SpyMock()
    with patch.object(enr, "get_llm_client", return_value=client):
        result = asyncio.run(enr.enrich_project(db, project))
    assert result["simulated"] is True
    assert client.calls == 0
    # Le client simulé aurait posé 350 M USD, des dates et « AECOM »…
    assert project.budget_usd is None
    assert project.start_date is None and project.end_date is None
    assert _ajouts(db, ProjectEntity) == []
    # … et des besoins « [LLM] » inventés. Seule l'extraction du texte reste.
    besoins = _ajouts(db, EquipmentNeed)
    assert besoins and all(b.rationale.startswith("[EXTRACT]") for b in besoins)
    sautees = {s["step"] for s in result["steps"] if s.get("skipped")}
    assert sautees == {"extract", "equipment"}


def test_enrichissement_vraie_ia_comportement_inchange():
    project, db, client = _project(), _db(), _FakeRealLLM()
    with patch.object(enr, "get_llm_client", return_value=client):
        result = asyncio.run(enr.enrich_project(db, project))
    assert result["simulated"] is False
    assert client.calls == 2  # métadonnées + besoins
    assert project.budget_usd is not None
    assert {e.name for e in _ajouts(db, ProjectEntity)} >= {"AECOM"}
    assert any(b.rationale.startswith("[LLM]") for b in _ajouts(db, EquipmentNeed))


# ---------------------------------------------------------------------------
# « Comparer IA » (analysis-compare)
# ---------------------------------------------------------------------------

def test_comparaison_simulee_marquee_sans_chiffre_ia():
    client = _SpyMock()
    with patch.object(enr, "get_llm_client", return_value=client):
        res = asyncio.run(enr.compare_project_methods(_project()))
    assert res["simulated"] is True
    assert res["raison"].strip()
    assert client.calls == 0
    assert res["llm_count"] is None
    assert res["llm_preview"] == []
    assert res["agreement"]["intersection_count"] is None
    assert res["agreement"]["only_llm"] == [] and res["agreement"]["intersection_categories"] == []
    assert res["spread"]["llm_qty_span_sum"] is None
    # La partie déterministe (texte de l'AO, aucune IA) reste servie.
    assert res["deterministic_count"] >= 1


def test_comparaison_simulee_garde_les_categories_lues_dans_l_avis():
    """Relecture du 2026-10-01, REV-6. Constaté : en mode simulé, only_deterministic
    était vidé ; un front qui construit ses « catégories extraites » à partir des
    listes d'accord n'affichait plus que « Extract: 1 », sans la pelle lue dans
    l'avis. Sans IA, toute catégorie extraite est « seulement extraction »."""
    with patch.object(enr, "get_llm_client", return_value=_SpyMock()):
        res = asyncio.run(enr.compare_project_methods(_project()))
    assert res["simulated"] is True
    assert res["agreement"]["only_deterministic"] == ["excavator"]
    assert res["agreement"]["only_deterministic"] == sorted(
        {n["category"] for n in res["deterministic_preview"]}
    )


def test_comparaison_vraie_ia_simulated_false():
    client = _FakeRealLLM()
    with patch.object(enr, "get_llm_client", return_value=client):
        res = asyncio.run(enr.compare_project_methods(_project()))
    assert res["simulated"] is False
    assert client.calls == 1
    assert res["llm_count"] == len(res["llm_preview"]) > 0


def test_route_analysis_compare_renvoie_le_drapeau():
    project = _project()
    project.entities, project.contacts, project.equipment_needs = [], [], []
    result = MagicMock()
    result.scalar_one_or_none.return_value = project
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    with patch.object(pr, "_enforce_llm_entitlement", AsyncMock()), \
         patch.object(pr, "get_settings", return_value=_settings()), \
         patch.object(enr, "get_llm_client", return_value=_SpyMock()):
        res = asyncio.run(pr.get_project_analysis_compare(
            project_id=project.id, request=MagicMock(), db=db, _paid_ok=True,
        ))
    assert res["simulated"] is True


# ---------------------------------------------------------------------------
# Détail ?ai=true
# ---------------------------------------------------------------------------

def _projet_detail():
    p = Project()
    p.id = uuid.uuid4()
    p.title = "Construction de la route nationale"
    p.fingerprint = "b" * 64
    p.confidence = None
    p.updated_at = datetime(2026, 9, 30)
    p.type = "road"
    p.phase = "construction"
    return p


def _ouvrir(project, settings, *, ai=True):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=project)
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    with patch.object(pr, "get_settings", return_value=settings), \
         patch.object(pr, "enrich_project", AsyncMock(return_value={})), \
         patch.object(pr, "_enforce_llm_entitlement", AsyncMock()):
        return asyncio.run(pr.get_project(
            project_id=project.id, request=MagicMock(), ai=ai, force_ai=False,
            db=db, _paid_ok=True,
        ))


@pytest.fixture(autouse=True)
def _vider_tentatives():
    pr._auto_enrich_attempts.clear()
    yield
    pr._auto_enrich_attempts.clear()


@pytest.mark.parametrize("provider,key", [("none", ""), ("mock", ""), ("openai", "")])
def test_detail_ai_sans_vraie_ia_simulated_true(provider, key):
    detail = _ouvrir(_projet_detail(), _settings(provider, key))
    assert detail.simulated is True
    assert detail.model_dump(mode="json")["simulated"] is True


def test_detail_ai_vraie_ia_simulated_false():
    detail = _ouvrir(_projet_detail(), _settings("openai", "cle-factice"))
    assert detail.simulated is False


def test_detail_sans_ai_simulated_absent():
    detail = _ouvrir(_projet_detail(), _settings("none", ""), ai=False)
    assert detail.simulated is None
