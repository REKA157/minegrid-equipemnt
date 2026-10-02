"""Tests require_paid_user_or_admin.

MG-M06 — L'entitlement passe desormais par la RPC `get_effective_subscription_for`
(POST), source d'autorite partagee avec la plateforme, et non plus par une lecture
directe de `pro_clients` (GET). Cette RPC applique l'heritage d'organisation et
l'expiration, deux regles que la lecture directe ignorait.
"""

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


def _patch_http_client(post_return: MagicMock) -> MagicMock:
    mock_client = AsyncMock()
    # La RPC est appelee en POST : mocker `get` laisserait passer un test vert
    # sur un appel qui n'a plus lieu.
    mock_client.post = AsyncMock(return_value=post_return)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


def _rpc_row(*, is_active: bool, sub_type: str = "premium",
             status: str = "active", source: str = "self") -> list[dict]:
    """Forme de reponse de get_effective_subscription_for : toujours une ligne."""
    return [{
        "is_active": is_active,
        "subscription_type": sub_type,
        "subscription_status": status,
        "ends_at": None,
        "source": source,
    }]


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


# ---------------------------------------------------------------------------
# Constaté le 2026-10-01 : un échec de la RPC (404 si absente, 5xx, réponse
# illisible) donnait 403 « Abonnement payant requis », mis en cache 60 s : un
# abonné en règle était accusé de ne pas payer pendant une panne de la
# plateforme. Une panne donne désormais 503, jamais mise en cache. Seule une
# réponse valide (is_active=false, palier sans radar) donne 403.
# ---------------------------------------------------------------------------

def test_rpc_abonnement_404_est_une_panne_503_pas_un_refus():
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=404,
                    text='function public.get_effective_subscription_for(uuid) does not exist',
                ),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 503
    assert exc.value.detail != "Abonnement payant requis"
    assert "abonnement" in exc.value.detail.lower()
    assert "réessayez" in exc.value.detail.lower()
    # Le refus n'est PAS retenu : rien en cache pour cet utilisateur.
    assert USER_ID not in _paid_access_cache


@pytest.mark.parametrize("status_code", [500, 502, 503, 401, 400])
def test_rpc_abonnement_statut_non_2xx_donne_503(status_code):
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(status_code=status_code, text="erreur"),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 503
    assert USER_ID not in _paid_access_cache


@pytest.mark.parametrize(
    "corps",
    [
        [],                                  # aucune ligne (la RPC en renvoie toujours une)
        {"message": "inattendu"},            # objet sans is_active
        [{"is_active": None}],               # is_active non booléen
        [{"is_active": "true"}],             # is_active en texte
        "pas une liste",
    ],
)
def test_rpc_abonnement_reponse_inexploitable_donne_503(corps):
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(status_code=200, json_body=corps),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 503
    assert USER_ID not in _paid_access_cache


def test_rpc_abonnement_json_illisible_donne_503():
    res = _mock_pro_clients_response(status_code=200, text="<html>")
    res.json = MagicMock(side_effect=ValueError("pas du JSON"))
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(res)
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 503


def test_panne_puis_retablissement_l_abonne_passe_aussitot():
    """La panne n'est pas mise en cache : dès que la RPC répond, l'abonné passe
    (avant : 60 s de 403 après la panne)."""
    panne = _patch_http_client(_mock_pro_clients_response(status_code=500, text="down"))
    retablie = _patch_http_client(
        _mock_pro_clients_response(status_code=200, json_body=_rpc_row(is_active=True)),
    )
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient", side_effect=[panne, retablie]):
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
            assert exc.value.status_code == 503
            assert asyncio.run(_require_paid()) is True


def test_vrai_refus_reste_403_et_est_mis_en_cache():
    """is_active=false est une réponse VALIDE : 403, retenu 60 s (pas de second
    appel réseau)."""
    client = _patch_http_client(
        _mock_pro_clients_response(status_code=200, json_body=_rpc_row(is_active=False, status="none")),
    )
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient", return_value=client) as client_cls:
            for _ in range(2):
                with pytest.raises(HTTPException) as exc:
                    asyncio.run(_require_paid())
                assert exc.value.status_code == 403
                assert exc.value.detail == "Abonnement payant requis"
    assert client_cls.call_count == 1
    assert _paid_access_cache[USER_ID][0] is False


def test_pro_clients_empty_list_denies_access():
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=_rpc_row(is_active=False, status="none"),
                ),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403


def test_pro_clients_active_subscription_allows_access():
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=_rpc_row(is_active=True, sub_type="premium"),
                ),
            )
            result = asyncio.run(_require_paid())
    assert result is True


def test_pro_clients_inactive_subscription_denies_access():
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=_rpc_row(is_active=False, sub_type="pro",
                                       status="cancelled"),
                ),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403


def test_pro_clients_http_error_returns_503():
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(side_effect=httpx.ConnectError("down"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            client_cls.return_value = mock_client
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 503


# ---------------------------------------------------------------------------
# MG-M06 — les deux divergences que la lecture directe de pro_clients causait.
# ---------------------------------------------------------------------------

def test_org_member_inherits_owner_subscription():
    """FAUX REFUS corrige : un membre dont l'organisation paie doit passer.

    Ce membre n'a AUCUNE ligne `pro_clients` a son nom ; l'ancienne requete
    directe le refusait alors qu'il est ayant droit.
    """
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=_rpc_row(is_active=True, sub_type="premium", source="org"),
                ),
            )
            result = asyncio.run(_require_paid())
    assert result is True


def test_expired_subscription_denies_access():
    """FAUX ACCES corrige : un abonnement expire ne doit plus ouvrir l'acces.

    La ligne reste `status = 'active'` mais sa date de fin est depassee ;
    l'ancienne verification ne testait jamais l'expiration. La RPC tranche via
    `is_active`.
    """
    expired = [{
        "is_active": False,
        "subscription_type": "pro",
        "subscription_status": "active",
        "ends_at": "2020-01-01T00:00:00+00:00",
        "source": "self",
    }]
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(status_code=200, json_body=expired),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Constaté le 2026-10-01 : nomenclature croisée des plans (src/config/plans.ts).
# Code interne 'pro' = plan AFFICHÉ « Premium » 20 $ (gestion du parc, sans
# radar) ; code 'premium' = plan affiché « Pro » 50 $ (radar). Le site réserve
# le radar au code 'premium' et plus ; le service l'ouvrait aussi à 'pro'.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sub_type", ["pro", "basic", "free"])
def test_formule_sans_radar_refusee(sub_type):
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=_rpc_row(is_active=True, sub_type=sub_type),
                ),
            )
            with pytest.raises(HTTPException) as exc:
                asyncio.run(_require_paid())
    assert exc.value.status_code == 403


@pytest.mark.parametrize("sub_type", ["premium", "enterprise", "Entreprise"])
def test_formule_avec_radar_acceptee(sub_type):
    with patch("app.auth.verify_supabase_token", AsyncMock(return_value=USER_ID)):
        with patch("app.auth.httpx.AsyncClient") as client_cls:
            client_cls.return_value = _patch_http_client(
                _mock_pro_clients_response(
                    status_code=200,
                    json_body=_rpc_row(is_active=True, sub_type=sub_type),
                ),
            )
            assert asyncio.run(_require_paid()) is True


def test_jeton_invalide_donne_401_avant_tout_appel_abonnement():
    with patch("app.auth.httpx.AsyncClient") as client_cls:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(_require_paid(credentials=_credentials("pas.un.jeton")))
    assert exc.value.status_code == 401
    client_cls.assert_not_called()
