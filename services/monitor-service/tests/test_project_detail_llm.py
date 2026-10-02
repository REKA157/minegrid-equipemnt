"""GET /projects/{id}?ai=true ne rappelle plus le LLM à chaque ouverture.

Constaté le 2026-10-01 : pour un projet dont l'enrichissement aboutit à zéro
besoin (« non machine » : fournitures, textile…), la condition « enrichir si
aucun besoin en base » restait vraie : le LLM était rappelé à chaque ouverture
(le front rouvrait le détail toutes les 45 s). Aucun vrai appel LLM ici :
enrich_project est remplacé et compté.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Project
from app.routes import projects as pr


def _project(title="Fourniture de produits pharmaceutiques") -> Project:
    p = Project()
    p.id = uuid.uuid4()
    p.title = title
    p.fingerprint = "a" * 64
    p.confidence = None
    p.updated_at = datetime(2026, 9, 30)
    p.type = "infrastructure"
    p.phase = "tender"
    return p


def _db_for(project):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=project)
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    return db


@pytest.fixture(autouse=True)
def _clear_attempts():
    pr._auto_enrich_attempts.clear()
    yield
    pr._auto_enrich_attempts.clear()


def _open(project, *, force_ai=False):
    return asyncio.run(pr.get_project(
        project_id=project.id, request=MagicMock(), ai=True, force_ai=force_ai,
        db=_db_for(project), _paid_ok=True,
    ))


def _patches(enrich, entitlement):
    settings = MagicMock()
    settings.llm_provider = "openai"
    return (
        patch.object(pr, "get_settings", return_value=settings),
        patch.object(pr, "enrich_project", enrich),
        patch.object(pr, "_enforce_llm_entitlement", entitlement),
    )


def test_projet_sans_besoin_un_seul_appel_llm_sur_plusieurs_ouvertures():
    project = _project()
    enrich, entitlement = AsyncMock(return_value={}), AsyncMock()
    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        for _ in range(4):  # 4 ouvertures = 3 minutes de sondage à 45 s
            detail = _open(project)
    assert enrich.await_count == 1
    # Le quota LLM n'est consommé que lorsqu'un appel LLM a réellement lieu.
    assert entitlement.await_count == 1
    # Projet « non machine » : aucune estimation inventée n'est servie.
    assert detail.equipment_needs == []


def test_force_ai_recalcule_toujours():
    project = _project()
    enrich, entitlement = AsyncMock(return_value={}), AsyncMock()
    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        _open(project)
        _open(project, force_ai=True)
    assert enrich.await_count == 2


def test_nouvelle_tentative_apres_24_heures():
    project = _project()
    enrich, entitlement = AsyncMock(return_value={}), AsyncMock()
    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        _open(project)
        # Simule une tentative vieille de plus de 24 h.
        pr._auto_enrich_attempts[str(project.id)] -= pr._AUTO_ENRICH_RETRY_AFTER_SEC + 1
        _open(project)
    assert enrich.await_count == 2


def test_echec_d_enrichissement_pas_de_rappel_en_boucle():
    project = _project()
    enrich, entitlement = AsyncMock(side_effect=RuntimeError("LLM indisponible")), AsyncMock()
    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        _open(project)
        _open(project)
    assert enrich.await_count == 1


def test_quota_depasse_permet_une_nouvelle_tentative_plus_tard():
    """Un 429 ne doit pas « consommer » la tentative : rien n'a été calculé."""
    from fastapi import HTTPException

    project = _project()
    enrich = AsyncMock(return_value={})
    entitlement = AsyncMock(side_effect=[HTTPException(status_code=429), None])
    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        with pytest.raises(HTTPException):
            _open(project)
        _open(project)
    assert enrich.await_count == 1


# ---------------------------------------------------------------------------
# REV-5 — constaté le 2026-10-01 (relecture) : la tentative était notée APRÈS
# `await _enforce_llm_entitlement`, qui fait un vrai appel réseau (contrôle
# d'abonnement) quand son cache de 60 s est vide. Deux ouvertures simultanées
# du même projet passaient donc toutes deux la vérification : 2 appels LLM.
# ---------------------------------------------------------------------------

def test_deux_ouvertures_simultanees_un_seul_appel_llm():
    project = _project()
    enrich = AsyncMock(return_value={})

    async def abonnement_verifie_par_le_reseau(*args, **kwargs):
        await asyncio.sleep(0.02)  # RPC d'abonnement : cache de 60 s expiré

    entitlement = AsyncMock(side_effect=abonnement_verifie_par_le_reseau)

    async def deux_ouvertures():
        return await asyncio.gather(*[
            pr.get_project(project_id=project.id, request=MagicMock(), ai=True, force_ai=False,
                           db=_db_for(project), _paid_ok=True)
            for _ in range(2)
        ])

    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        details = asyncio.run(deux_ouvertures())
    assert enrich.await_count == 1
    assert entitlement.await_count == 1  # la seconde n'a même pas consommé de quota
    assert all(d.equipment_needs == [] for d in details)


def test_recalcul_force_refuse_par_le_quota_garde_la_tentative_precedente():
    """Un 429 sur force_ai ne doit pas effacer la tentative automatique déjà
    faite : sinon l'ouverture suivante rappellerait le LLM."""
    from fastapi import HTTPException

    project = _project()
    enrich = AsyncMock(return_value={})
    entitlement = AsyncMock(side_effect=[None, HTTPException(status_code=429), None])
    p1, p2, p3 = _patches(enrich, entitlement)
    with p1, p2, p3:
        _open(project)                       # tentative automatique : 1 appel LLM
        with pytest.raises(HTTPException):
            _open(project, force_ai=True)    # bouton « recalculer » : quota dépassé
        _open(project)                       # ouverture normale : rien à rappeler
    assert enrich.await_count == 1
    assert pr._auto_enrich_recently_attempted(project.id)


def test_annulation_n_efface_pas_une_tentative_plus_recente():
    project_id = uuid.uuid4()
    claim_a = pr._remember_auto_enrich_attempt(project_id)
    claim_b = pr._remember_auto_enrich_attempt(project_id)  # autre requête entre-temps
    assert claim_b[1] > claim_a[1]  # identifiants distincts même sans avancée d'horloge
    pr._cancel_auto_enrich_attempt(project_id, claim_a)
    assert pr._auto_enrich_attempts[str(project_id)] == claim_b[1]
    pr._cancel_auto_enrich_attempt(project_id, claim_b)
    # B annulée : on revient à A (sa tentative précédente), pas à « jamais tenté ».
    assert pr._auto_enrich_attempts[str(project_id)] == claim_a[1]


def test_memoire_des_tentatives_bornee():
    original = pr._AUTO_ENRICH_MAX_KEYS
    pr._AUTO_ENRICH_MAX_KEYS = 3
    try:
        ids = [uuid.uuid4() for _ in range(5)]
        for i in ids:
            pr._remember_auto_enrich_attempt(i)
        assert len(pr._auto_enrich_attempts) == 3
        assert str(ids[0]) not in pr._auto_enrich_attempts  # la plus ancienne part
        assert str(ids[-1]) in pr._auto_enrich_attempts
    finally:
        pr._AUTO_ENRICH_MAX_KEYS = original
