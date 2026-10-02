"""Paywall des alertes : les événements recopient les données du radar.

Constaté le 2026-10-01 : un compte gratuit créait une règle vide (qui
correspond à tout) puis lisait /alerts/events — titre, pays, budget de chaque
projet récent — sans formule incluant le radar.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.auth as auth
from app.config import get_settings
from app.database import get_db
from app.routes import alerts

USER_ID = "bbbbbbbb-1111-2222-3333-444444444444"


def _app():
    app = FastAPI()
    app.include_router(alerts.router)
    session = MagicMock()
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    session.execute = AsyncMock(return_value=result)

    async def _db():
        yield session

    settings = MagicMock()
    settings.admin_token = "admin-de-test"
    settings.supabase_url = "https://projet-test.supabase.co"
    settings.supabase_service_role_key = "cle-service-de-test"
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_settings] = lambda: settings
    return app, session


def _rpc(sub_type):
    res = MagicMock(status_code=200)
    res.json = MagicMock(return_value=[{
        "is_active": sub_type is not None, "subscription_type": sub_type or "basic",
        "subscription_status": "active",
    }])
    client = AsyncMock()
    client.post = AsyncMock(return_value=res)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


@pytest.fixture(autouse=True)
def _clear():
    auth._paid_access_cache.clear()
    yield
    auth._paid_access_cache.clear()


def _call(method, path, sub_type, **kw):
    app, session = _app()
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)), \
            patch("app.auth.httpx.AsyncClient", return_value=_rpc(sub_type)):
        res = getattr(TestClient(app), method)(
            path, headers={"Authorization": "Bearer jeton-de-test"}, **kw)
    return res, session


@pytest.mark.parametrize("sub_type", [None, "pro"])
def test_evenements_refuses_sans_formule_radar(sub_type):
    res, session = _call("get", "/alerts/events", sub_type)
    assert res.status_code == 403
    session.execute.assert_not_awaited()


def test_creation_de_regle_refusee_sans_formule_radar():
    res, session = _call("post", "/alerts/subscribe", None, json={"rule": {}})
    assert res.status_code == 403
    session.add.assert_not_called()


def test_evenements_accessibles_formule_premium():
    res, _ = _call("get", "/alerts/events", "premium")
    assert res.status_code == 200
    assert res.json() == []


def test_lister_ses_regles_reste_ouvert_a_tout_compte_connecte():
    res, _ = _call("get", "/alerts/rules", None)
    assert res.status_code == 200
