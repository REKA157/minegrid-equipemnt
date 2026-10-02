"""Génération des alertes en fin d'ingestion (et plus seulement toutes les 6 h).

Constaté le 2026-10-01 (audit du 2026-09-08) : une règle correspondant à un
nouveau projet restait « Aucun événement récent » jusqu'à 6 h après l'ingestion.
L'anti-doublons réel (même utilisateur + même projet sur 24 h) est prouvé contre
un vrai Postgres dans tests/test_integration_postgres.py.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import app.alerts.generator as generator
import app.scheduler as scheduler
from app.routes import admin
from app.schemas import IngestResult


class _Session:
    def __init__(self):
        self.rollback = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def test_fin_d_ingestion_planifiee_genere_les_alertes():
    session = _Session()
    gen = AsyncMock(return_value={"events_created": 2})
    with patch.object(scheduler, "AsyncSessionLocal", return_value=session), \
            patch.object(scheduler, "run_all", AsyncMock(return_value=IngestResult(inserted=3))), \
            patch.object(generator, "generate_alert_events", gen):
        asyncio.run(scheduler.scheduled_ingest())
    gen.assert_awaited_once_with(session)


def test_ingestion_sans_projet_nouveau_ne_genere_rien():
    session = _Session()
    gen = AsyncMock()
    with patch.object(scheduler, "AsyncSessionLocal", return_value=session), \
            patch.object(scheduler, "run_all", AsyncMock(return_value=IngestResult(errors=4))), \
            patch.object(generator, "generate_alert_events", gen):
        asyncio.run(scheduler.scheduled_ingest())
    gen.assert_not_awaited()


def test_echec_de_generation_ne_fait_pas_echouer_l_ingestion():
    session = _Session()
    gen = AsyncMock(side_effect=RuntimeError("base occupée"))
    with patch.object(generator, "generate_alert_events", gen):
        out = asyncio.run(generator.generate_alerts_after_ingest(session, IngestResult(updated=1)))
    assert out is None
    session.rollback.assert_awaited_once()


def test_ingestion_manuelle_admin_genere_les_alertes():
    session = _Session()
    gen = AsyncMock(return_value={"events_created": 1})
    with patch.object(admin, "run_all", AsyncMock(return_value=IngestResult(inserted=1))), \
            patch.object(generator, "generate_alert_events", gen):
        result = asyncio.run(admin.run_ingest(db=session))
    assert result.inserted == 1
    gen.assert_awaited_once_with(session)


def test_import_json_admin_genere_les_alertes():
    session = _Session()
    gen = AsyncMock(return_value={"events_created": 1})
    with patch.object(admin, "upsert_assets", AsyncMock(return_value=IngestResult(inserted=1))), \
            patch.object(generator, "generate_alert_events", gen):
        asyncio.run(admin.import_json(payload=[{"title": "Route de Bouaké"}], db=session))
    gen.assert_awaited_once_with(session)


def test_generation_serialisee_par_un_verrou():
    """Fin d'ingestion et tâche des 6 h ne doivent pas se chevaucher."""
    actifs = {"n": 0, "max": 0}

    async def fake_locked(db, since_hours):
        actifs["n"] += 1
        actifs["max"] = max(actifs["max"], actifs["n"])
        await asyncio.sleep(0.01)
        actifs["n"] -= 1
        return {}

    async def run():
        with patch.object(generator, "_generate_alert_events_locked", fake_locked):
            await asyncio.gather(*(generator.generate_alert_events(MagicMock()) for _ in range(3)))

    original = generator._generation_lock
    generator._generation_lock = asyncio.Lock()  # verrou propre à cette boucle de test
    try:
        asyncio.run(run())
    finally:
        generator._generation_lock = original
    assert actifs["max"] == 1


def test_recherche_de_doublon_lit_au_plus_une_ligne():
    """scalar_one_or_none() levait MultipleResultsFound dès 2 événements existants."""
    import inspect
    src = inspect.getsource(generator._generate_alert_events_locked)
    assert ".limit(1)" in src
