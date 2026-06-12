"""Tests require_paid_user_or_admin — pas de fallback si pro_clients absent."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import _paid_access_cache, require_paid_user_or_admin

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def _credentials(token: str = "fake-jwt") -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _settings() -> MagicMock:
    s = MagicMock()
    s.admin_token = "admin-secret"
    s.supabase_url = "https://example.supabase.co"
    s.supabase_service_role_key = "service-role-key"
    s.supabase_jwt_secret = "jwt-secret"
    return s


async def _require_paid(**kwargs) -> bool:
    return await require_paid_user_or_admin(
        credentials=kwargs.get("credentials", _credentials()),
        x_admin_token=kwargs.get("x_admin_token"),
        settings=kwargs.get("settings", _settings()),
    )


def _mock_pro_clients_response(*, status_code: int, json_body=None, text: str = "") -> MagicMock:
    res = MagicMock()
    res.status_code = status_code
    res.text = text
    if json_body is not None:
        res.json = MagicMock(return_value=json_body)
    return res


def _patch_http_client(get_return: MagicMock) -> MagicMock:
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=get_return)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


@pytest.fixture(autouse=True)
def clear_paid_cache():
    _paid_access_cache.clear()
    yield
    _paid_access_cache.clear()


def test_admin_token_bypasses_pro_clients_check():
    result = asyncio.run(
        _require_paid(x_admin_token="admin-secret", credentials=None),
    )
    assert result is True


def test_pro_clients_404_denies_access():
    with patch("app.auth.jwt.decode", return_value={"sub": USER_ID}):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=404,
                    text='relation "public.pro_clients" does not exist',
                ),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403
    assert exc.value.detail == "Abonnement payant requis"


def test_pro_clients_empty_list_denies_access():
    with patch("app.auth.jwt.decode", return_value={"sub": USER_ID}):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(status_code=200, json_body=[]),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403


def test_pro_clients_active_subscription_allows_access():
    with patch("app.auth.jwt.decode", return_value={"sub": USER_ID}):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=[
                        {
                            "subscription_type": "pro",
                            "subscription_status": "active",
                        },
                    ],
                ),
            )
            result = asyncio.run(_require_paid())
    assert result is True


def test_pro_clients_inactive_subscription_denies_access():
    with patch("app.auth.jwt.decode", return_value={"sub": USER_ID}):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=[
                        {
                            "subscription_type": "pro",
                            "subscription_status": "cancelled",
                        },
                    ],
                ),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403


def test_pro_clients_http_error_returns_503():
    with patch("app.auth.jwt.decode", return_value={"sub": USER_ID}):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("down"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            client_cls.return_value = mock_client
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 503
