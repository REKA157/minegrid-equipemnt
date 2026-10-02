"""Intégration contre un VRAI Postgres jetable (jamais la base du radar).

Ignoré sans MONITOR_TEST_DATABASE_URL. Garde-fou : le nom de la base doit
contenir « test » (les tables y sont supprimées puis recréées).

Exemple (conteneur jetable, détruit après) :
    docker network create mg-radar-test
    docker run -d --rm --name mg-radar-test-pg --network mg-radar-test \
        -e POSTGRES_PASSWORD=test -e POSTGRES_DB=radar_test postgres:16-alpine
    docker run --rm --network mg-radar-test -v "$PWD:/src" -w /src \
        -e MONITOR_TEST_DATABASE_URL=postgresql+asyncpg://postgres:test@mg-radar-test-pg:5432/radar_test \
        monitor-service-monitor-api:latest python -m pytest -q tests/test_integration_postgres.py

Prouve :
  - R4 : le filtre pays de GET /projects trouve « Cote d'Ivoire », « Côte d'Ivoire »
    et « CÔTE D’IVOIRE » avec translate()/lower() natifs (aucune extension) ;
  - R6 : la génération d'alertes ne crée qu'un événement par (utilisateur,
    projet), même rejouée, même avec plusieurs règles, et ne plante plus si des
    doublons anciens existent déjà.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

DB_URL = os.environ.get("MONITOR_TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not DB_URL, reason="MONITOR_TEST_DATABASE_URL non défini (Postgres jetable requis)"
)

USER = uuid.UUID("cccccccc-1111-2222-3333-444444444444")


def _guard():
    name = make_url(DB_URL).database or ""
    if "test" not in name:
        pytest.fail(f"Refus : la base {name!r} ne contient pas « test » dans son nom")


async def _with_fresh_schema(body):
    from app.database import Base
    from app import models  # noqa: F401 — enregistre toutes les tables

    _guard()
    engine = create_async_engine(DB_URL)
    try:
        async with engine.begin() as conn:
            # Pas d'extension unaccent : la comparaison ne doit pas en dépendre.
            ext = await conn.execute(text("select count(*) from pg_extension where extname = 'unaccent'"))
            assert ext.scalar_one() == 0
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            await body(session)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    finally:
        await engine.dispose()


def _project(title: str, country: str, i: int):
    from app.models import Project

    return Project(
        title=title, country=country, type="road", phase="construction",
        budget_usd=Decimal("5000000"), source="test", fingerprint=f"{i:064d}",
        updated_at=datetime.utcnow(),
    )


async def _seed_projects(session):
    rows = [
        _project("Route Abidjan–Bouaké (Banque mondiale)", "Cote d'Ivoire", 1),
        _project("Échangeur de Yopougon", "Côte d'Ivoire", 2),
        _project("Voirie de Korhogo", "CÔTE D’IVOIRE", 3),
        _project("Autoroute à péage Dakar", "Senegal", 4),
        _project("Pont de Rosso", "Sénégal", 5),
    ]
    session.add_all(rows)
    await session.commit()
    return rows


def test_filtre_pays_sans_accents_sur_vrai_postgres():
    from app.routes.projects import list_projects

    async def body(session):
        await _seed_projects(session)

        async def lister(country):
            return await list_projects(
                country=country, type=None, phase=None, source_kind=None, search=None,
                page=1, page_size=20, db=session, _paid_ok=True,
            )

        res = await lister("Côte d'Ivoire")
        assert res.total == 3
        assert {p.country for p in res.items} == {"Cote d'Ivoire", "Côte d'Ivoire", "CÔTE D’IVOIRE"}
        assert (await lister("cote d'ivoire")).total == 3
        assert (await lister("Senegal")).total == 2
        assert (await lister("SÉNÉGAL")).total == 2
        assert (await lister("Ghana")).total == 0

    asyncio.run(_with_fresh_schema(body))


def test_alertes_sans_doublon_sur_vrai_postgres():
    from app.alerts.generator import generate_alert_events, generate_alerts_after_ingest
    from app.models import AlertEvent, AlertRule
    from app.schemas import IngestResult

    async def body(session):
        projects = await _seed_projects(session)
        # Deux règles du même utilisateur qui couvrent les mêmes projets.
        session.add_all([
            AlertRule(user_id=USER, rule={"country": ["Côte d'Ivoire"]}),
            AlertRule(user_id=USER, rule={"keywords": ["abidjan", "echangeur", "voirie"]}),
        ])
        await session.commit()

        first = await generate_alert_events(session)
        assert first["events_created"] == 3  # 3 projets ivoiriens, un événement chacun

        again = await generate_alerts_after_ingest(session, IngestResult(updated=1))
        assert again["events_created"] == 0  # rejouée en fin d'ingestion : aucun doublon

        # Doublons anciens (deux exécutions concurrentes d'avant le verrou) :
        # l'ancienne recherche scalar_one_or_none() levait MultipleResultsFound
        # et bloquait toute la génération pendant 24 h.
        senegal = projects[3]
        for _ in range(2):
            session.add(AlertEvent(user_id=USER, project_id=senegal.id, event_type="rule_match",
                                   payload={}, created_at=datetime.utcnow() - timedelta(hours=1)))
        session.add(AlertRule(user_id=USER, rule={"country": ["senegal"]}))
        await session.commit()

        third = await generate_alert_events(session)
        assert third["events_created"] == 1  # seul « Pont de Rosso » (Sénégal) est nouveau

        total = (await session.execute(
            select(func.count(AlertEvent.id)).where(AlertEvent.user_id == USER)
        )).scalar_one()
        assert total == 3 + 2 + 1

    asyncio.run(_with_fresh_schema(body))
