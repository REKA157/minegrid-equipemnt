"""Paywall de GET /projects et GET /projects/{id}.

Constaté le 2026-10-01 : ces deux routes n'exigeaient que require_user_or_admin.
Un compte GRATUIT lisait tout le radar en appelant l'API directement, alors que
le site réserve ces pages aux formules payantes (paidRoute('premium')).
On passe par une vraie application FastAPI (routage + dépendances réels) ; seuls
la base et l'appel Supabase « quelle formule ? » sont remplacés.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.auth as auth
from app.config import get_settings
from app.database import get_db
from app.models import Project
from app.routes import projects as projects_routes

USER_ID = "aaaaaaaa-1111-2222-3333-444444444444"


class _Result:
    def __init__(self, scalar=None, items=None):
        self._scalar = scalar
        self._items = items or []

    def scalar_one(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return MagicMock(all=MagicMock(return_value=self._items))


def _project() -> Project:
    p = Project()
    p.id = uuid.uuid4()
    p.title = "Route nationale — travaux de terrassement"
    p.fingerprint = "f" * 64
    p.confidence = None
    p.updated_at = datetime(2026, 9, 30)
    p.type = None
    p.phase = None
    return p


def _make_app(db_results):
    app = FastAPI()
    app.include_router(projects_routes.router)
    session = MagicMock()
    session.execute = AsyncMock(side_effect=list(db_results))

    async def _fake_db():
        yield session

    settings = MagicMock()
    settings.admin_token = "admin-de-test"
    settings.supabase_url = "https://projet-test.supabase.co"
    settings.supabase_service_role_key = "cle-service-de-test"
    settings.llm_provider = "none"
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    return app, session


def _rpc_client(sub_type: str | None):
    """Simule la réponse de get_effective_subscription_for (une ligne)."""
    res = MagicMock()
    res.status_code = 200
    res.json = MagicMock(return_value=[{
        "is_active": sub_type is not None,
        "subscription_type": sub_type or "basic",
        "subscription_status": "active" if sub_type else "none",
    }])
    client = AsyncMock()
    client.post = AsyncMock(return_value=res)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


@pytest.fixture(autouse=True)
def _clear_cache():
    auth._paid_access_cache.clear()
    yield
    auth._paid_access_cache.clear()


def _get(path: str, sub_type: str | None, db_results=()):
    app, session = _make_app(db_results)
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)), \
            patch("app.auth.httpx.AsyncClient", return_value=_rpc_client(sub_type)):
        res = TestClient(app).get(path, headers={"Authorization": "Bearer jeton-de-test"})
    return res, session


@pytest.mark.parametrize("sub_type", [None, "basic", "pro"])
def test_liste_refusee_aux_comptes_sans_radar(sub_type):
    res, session = _get("/projects", sub_type)
    assert res.status_code == 403
    assert res.json()["detail"] == "Abonnement payant requis"
    session.execute.assert_not_awaited()  # aucune donnée lue


@pytest.mark.parametrize("sub_type", [None, "pro"])
def test_detail_refuse_aux_comptes_sans_radar(sub_type):
    res, session = _get(f"/projects/{uuid.uuid4()}", sub_type)
    assert res.status_code == 403
    session.execute.assert_not_awaited()


def test_liste_accessible_formule_premium():
    res, _ = _get("/projects", "premium", db_results=[_Result(scalar=0), _Result(items=[])])
    assert res.status_code == 200
    assert res.json()["total"] == 0


def test_detail_accessible_formule_enterprise():
    project = _project()
    res, _ = _get(f"/projects/{project.id}", "enterprise", db_results=[_Result(scalar=project)])
    assert res.status_code == 200
    assert res.json()["id"] == str(project.id)


def test_sans_jeton_401():
    app, session = _make_app(())
    res = TestClient(app).get("/projects")
    assert res.status_code == 401
    session.execute.assert_not_awaited()


def test_admin_par_x_admin_token_toujours_accepte():
    app, _ = _make_app([_Result(scalar=0), _Result(items=[])])
    res = TestClient(app).get("/projects", headers={"X-Admin-Token": "admin-de-test"})
    assert res.status_code == 200
