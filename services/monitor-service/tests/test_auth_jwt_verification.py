"""Vérification des jetons Supabase : HS256 hérité + ES256/RS256 via JWKS.

Constaté le 2026-10-01 : le projet Supabase de production publie une clé
ES256 (JWKS : 1 clé alg=ES256 kty=EC). Le radar ne vérifiait qu'en HS256 :
get_current_user (alertes, widgets IA) répondait 401 « Token invalide » à tout
jeton ES256, sans repli. Ces tests utilisent de VRAIES paires de clés générées
avec `cryptography` (aucun jeton simulé) et un JWKS injecté à la place du
téléchargement réseau.
"""
from __future__ import annotations

import asyncio
import base64
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

import app.auth as auth

USER_ID = "11111111-2222-3333-4444-555555555555"
SUPABASE_URL = "https://projet-test.supabase.co"
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
HS_SECRET = "secret-herite-de-test-suffisamment-long"


def _b64(n: int, length: int) -> str:
    return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()


def _ec_pair(kid: str):
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    nums = key.public_key().public_numbers()
    # Même forme que le JWKS réel de Supabase (champs key_ops / ext inclus).
    jwk = {
        "kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": kid,
        "key_ops": ["verify"], "ext": True,
        "x": _b64(nums.x, 32), "y": _b64(nums.y, 32),
    }
    return pem, jwk


def _rsa_pair(kid: str):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    nums = key.public_key().public_numbers()
    jwk = {
        "kty": "RSA", "alg": "RS256", "use": "sig", "kid": kid,
        "n": _b64(nums.n, 256), "e": _b64(nums.e, 3),
    }
    return pem, jwk


def _claims(**over):
    claims = {
        "sub": USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    claims.update(over)
    return claims


def _sign(pem: str, alg: str, kid: str | None, **over) -> str:
    headers = {"kid": kid} if kid else None
    return jwt.encode(_claims(**over), pem, algorithm=alg, headers=headers)


def _settings(**over):
    base = dict(
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=HS_SECRET,
        supabase_service_role_key="cle-service-de-test",
        admin_token="admin-de-test",
    )
    base.update(over)
    return SimpleNamespace(**base)


def _reset_auth_state():
    auth._jwks_cache.reset()
    auth._auth_refusals.clear()
    auth._last_secret_mismatch_log = None


@pytest.fixture(autouse=True)
def _fresh_cache():
    _reset_auth_state()
    yield
    _reset_auth_state()


class _Clock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def _verify(token: str, settings=None) -> str:
    return asyncio.run(auth.verify_supabase_token(token, settings or _settings()))


def _jwks(*jwks):
    return {"keys": list(jwks)}


# ---------------------------------------------------------------------------
# ES256 (cas de la production)
# ---------------------------------------------------------------------------

def test_jeton_es256_valide_accepte_sans_appel_reseau_au_repli():
    pem, jwk = _ec_pair("cle-prod")
    fetch = AsyncMock(return_value=_jwks(jwk))
    fallback = AsyncMock(return_value=None)
    with patch.object(auth, "_fetch_jwks", fetch), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        assert _verify(_sign(pem, "ES256", "cle-prod")) == USER_ID
    fetch.assert_awaited_once_with(JWKS_URL)
    fallback.assert_not_awaited()


def test_jwks_mis_en_cache_entre_deux_requetes():
    pem, jwk = _ec_pair("cle-prod")
    fetch = AsyncMock(return_value=_jwks(jwk))
    with patch.object(auth, "_fetch_jwks", fetch):
        _verify(_sign(pem, "ES256", "cle-prod"))
        _verify(_sign(pem, "ES256", "cle-prod"))
    assert fetch.await_count == 1


def test_jwks_recharge_apres_expiration_du_cache():
    pem, jwk = _ec_pair("cle-prod")
    fetch = AsyncMock(return_value=_jwks(jwk))
    clock = _Clock()
    with patch.object(auth, "_fetch_jwks", fetch), patch.object(auth, "_monotonic", clock):
        _verify(_sign(pem, "ES256", "cle-prod"))
        clock.t += auth._JWKS_TTL_SEC + 1
        _verify(_sign(pem, "ES256", "cle-prod"))
    assert fetch.await_count == 2


def test_signature_d_une_autre_cle_refusee_sans_repli():
    _, jwk_publiee = _ec_pair("cle-prod")
    pem_pirate, _ = _ec_pair("cle-prod")  # même kid, autre clé privée
    fetch = AsyncMock(return_value=_jwks(jwk_publiee))
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_fetch_jwks", fetch), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        with pytest.raises(HTTPException) as exc:
            _verify(_sign(pem_pirate, "ES256", "cle-prod"))
    assert exc.value.status_code == 401
    # Refus définitif : Supabase refuserait aussi, inutile de l'appeler.
    fallback.assert_not_awaited()


def test_jeton_expire_refuse():
    pem, jwk = _ec_pair("cle-prod")
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))), \
            patch.object(auth, "_verify_with_supabase_auth", AsyncMock(return_value=USER_ID)) as fb:
        with pytest.raises(HTTPException) as exc:
            _verify(_sign(pem, "ES256", "cle-prod", exp=int(time.time()) - 60))
    assert exc.value.status_code == 401
    fb.assert_not_awaited()


def test_jeton_sans_expiration_refuse():
    pem, jwk = _ec_pair("cle-prod")
    claims = _claims()
    del claims["exp"]
    token = jwt.encode(claims, pem, algorithm="ES256", headers={"kid": "cle-prod"})
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))):
        with pytest.raises(HTTPException) as exc:
            _verify(token)
    assert exc.value.status_code == 401


def test_mauvaise_audience_refusee():
    pem, jwk = _ec_pair("cle-prod")
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))):
        with pytest.raises(HTTPException) as exc:
            _verify(_sign(pem, "ES256", "cle-prod", aud="anon"))
    assert exc.value.status_code == 401


def test_kid_inconnu_declenche_un_rechargement_du_jwks():
    pem_ancienne, jwk_ancienne = _ec_pair("cle-2026-09")
    pem_nouvelle, jwk_nouvelle = _ec_pair("cle-2026-10")
    # 1er téléchargement : ancienne clé seule ; 2e (après rotation) : les deux.
    fetch = AsyncMock(side_effect=[_jwks(jwk_ancienne), _jwks(jwk_ancienne, jwk_nouvelle)])
    clock = _Clock()
    with patch.object(auth, "_fetch_jwks", fetch), patch.object(auth, "_monotonic", clock):
        assert _verify(_sign(pem_ancienne, "ES256", "cle-2026-09")) == USER_ID
        clock.t += 5  # cache encore valide (TTL 10 min)
        assert _verify(_sign(pem_nouvelle, "ES256", "cle-2026-10")) == USER_ID
    assert fetch.await_count == 2


def test_kid_fantaisiste_ne_declenche_pas_un_telechargement_par_requete():
    pem, jwk = _ec_pair("cle-prod")
    pem_inconnue, _ = _ec_pair("kid-fantaisiste")
    fetch = AsyncMock(return_value=_jwks(jwk))
    fallback = AsyncMock(return_value=None)
    clock = _Clock()
    with patch.object(auth, "_fetch_jwks", fetch), patch.object(auth, "_monotonic", clock), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        _verify(_sign(pem, "ES256", "cle-prod"))           # 1 téléchargement
        for _ in range(5):
            clock.t += 1
            with pytest.raises(HTTPException):
                _verify(_sign(pem_inconnue, "ES256", "kid-fantaisiste"))
    # 1 initial + 1 seul rechargement forcé (pause de 30 s entre deux).
    assert fetch.await_count == 2


# ---------------------------------------------------------------------------
# RS256 et HS256 hérité
# ---------------------------------------------------------------------------

def test_jeton_rs256_valide_accepte():
    pem, jwk = _rsa_pair("cle-rsa")
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))):
        assert _verify(_sign(pem, "RS256", "cle-rsa")) == USER_ID


def test_jeton_hs256_herite_toujours_accepte_sans_jwks():
    fetch = AsyncMock(side_effect=AssertionError("le JWKS ne doit pas être téléchargé"))
    with patch.object(auth, "_fetch_jwks", fetch):
        assert _verify(_sign(HS_SECRET, "HS256", None)) == USER_ID
    fetch.assert_not_awaited()


# ---------------------------------------------------------------------------
# REV-1 — signature HS256 fausse : repli Supabase Auth (et non refus définitif)
#
# Constaté le 2026-10-01 (relecture) : une clé ES256 dans le JWKS ne prouve pas
# que la production signe en ES256 (Supabase publie la future clé « standby »
# avant de s'en servir). Si le projet signe encore en HS256 et que
# SUPABASE_JWT_SECRET du serveur est faux, le refus définitif aurait coupé le
# radar à tous les abonnés, là où l'ancien code les acceptait par le repli.
# ---------------------------------------------------------------------------
AUTRE_SECRET = "un-autre-secret-de-meme-longueur-environ"


def test_jeton_hs256_secret_du_serveur_faux_accepte_par_supabase_auth(caplog):
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_verify_with_supabase_auth", fallback), \
            caplog.at_level("ERROR", logger="monitor.auth"):
        assert _verify(_sign(AUTRE_SECRET, "HS256", None)) == USER_ID
    fallback.assert_awaited_once()
    # Le secret faux est PROUVÉ (Supabase accepte le jeton) : on le dit clairement.
    assert "SUPABASE_JWT_SECRET ne correspond pas" in caplog.text


def test_jeton_hs256_signature_fausse_et_supabase_refuse_401(caplog):
    fallback = AsyncMock(return_value=None)
    with patch.object(auth, "_verify_with_supabase_auth", fallback), \
            caplog.at_level("ERROR", logger="monitor.auth"):
        with pytest.raises(HTTPException) as exc:
            _verify(_sign(AUTRE_SECRET, "HS256", None))
    assert exc.value.status_code == 401
    fallback.assert_awaited_once()
    # Jeton simplement forgé : aucune alerte « secret faux » trompeuse.
    assert "SUPABASE_JWT_SECRET" not in caplog.text


def test_journal_secret_faux_ecrit_au_plus_une_fois_toutes_les_10_minutes(caplog):
    clock = _Clock()
    with patch.object(auth, "_verify_with_supabase_auth", AsyncMock(return_value=USER_ID)), \
            patch.object(auth, "_monotonic", clock), caplog.at_level("ERROR", logger="monitor.auth"):
        for _ in range(3):
            _verify(_sign(AUTRE_SECRET, "HS256", None))
        assert caplog.text.count("SUPABASE_JWT_SECRET ne correspond pas") == 1
        clock.t += auth._SECRET_MISMATCH_LOG_EVERY_SEC + 1
        _verify(_sign(AUTRE_SECRET, "HS256", None))
    assert caplog.text.count("SUPABASE_JWT_SECRET ne correspond pas") == 2


def test_jeton_hs256_bon_secret_mais_expire_refus_definitif_sans_repli():
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_verify_with_supabase_auth", fallback):
        with pytest.raises(HTTPException) as exc:
            _verify(_sign(HS_SECRET, "HS256", None, exp=int(time.time()) - 60))
    assert exc.value.status_code == 401
    fallback.assert_not_awaited()


def test_garde_payante_secret_faux_abonne_toujours_accepte():
    """Le scénario de la relecture, au niveau de la garde des routes du radar."""
    fallback = AsyncMock(return_value=USER_ID)
    auth._paid_access_cache.clear()
    auth._paid_cache_set(USER_ID, True, time.time() + 60)  # abonnement déjà vérifié
    try:
        with patch.object(auth, "_verify_with_supabase_auth", fallback):
            ok = asyncio.run(auth.require_paid_user_or_admin(
                credentials=_creds(_sign(AUTRE_SECRET, "HS256", None)), x_admin_token=None,
                settings=_settings()))
    finally:
        auth._paid_access_cache.clear()
    assert ok is True
    fallback.assert_awaited_once()


# --- Cache des refus de Supabase Auth (borne le coût du repli) --------------

class _FakeAuthClient:
    """Remplace httpx.AsyncClient pour /auth/v1/user (aucun appel réseau)."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None):
        self.calls += 1
        assert url == f"{SUPABASE_URL}/auth/v1/user"
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _http(status, body=None):
    return SimpleNamespace(status_code=status, json=lambda: body or {})


def test_refus_de_supabase_retenu_60_s_pour_le_meme_jeton():
    token = _sign(AUTRE_SECRET, "HS256", None)
    client = _FakeAuthClient([_http(403), _http(403)])
    clock = _Clock()
    with patch.object(auth.httpx, "AsyncClient", client), patch.object(auth, "_monotonic", clock):
        for _ in range(5):
            with pytest.raises(HTTPException):
                _verify(token)
        assert client.calls == 1  # 5 requêtes, 1 seul appel réseau
        clock.t += auth._AUTH_REFUSAL_TTL_SEC + 1
        with pytest.raises(HTTPException):
            _verify(token)
    assert client.calls == 2


def test_panne_de_supabase_auth_non_retenue_comme_refus():
    """Un 5xx ou une coupure réseau ne doit pas bloquer un jeton valable."""
    token = _sign(AUTRE_SECRET, "HS256", None)
    client = _FakeAuthClient([_http(503), OSError("réseau coupé"), _http(429),
                              _http(200, {"id": USER_ID})])
    with patch.object(auth.httpx, "AsyncClient", client):
        for _ in range(3):
            with pytest.raises(HTTPException):
                _verify(token)
        assert _verify(token) == USER_ID
    assert client.calls == 4


def test_cache_des_refus_ne_stocke_pas_le_jeton_et_reste_borne():
    original = auth._AUTH_REFUSAL_MAX_KEYS
    auth._AUTH_REFUSAL_MAX_KEYS = 3
    try:
        tokens = [f"jeton-{i}" for i in range(5)]
        for t in tokens:
            auth._remember_supabase_refusal(t)
        assert len(auth._auth_refusals) == 3
        assert not any(t in auth._auth_refusals for t in tokens)  # empreintes seulement
        assert auth._recently_refused_by_supabase(tokens[-1])
        assert not auth._recently_refused_by_supabase(tokens[0])
    finally:
        auth._AUTH_REFUSAL_MAX_KEYS = original


# ---------------------------------------------------------------------------
# REV-2 — en-tête forgé dont « alg » ou « kid » n'est pas une chaîne : 401, pas 500
# ---------------------------------------------------------------------------

def _forged(header: dict) -> str:
    import json
    h = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b"=").decode()
    b = base64.urlsafe_b64encode(json.dumps(_claims()).encode()).rstrip(b"=").decode()
    return f"{h}.{b}.c2lnbmF0dXJl"


@pytest.mark.parametrize("header", [
    {"alg": ["ES256"], "typ": "JWT"},
    {"alg": 256, "typ": "JWT"},
    {"alg": {"x": 1}, "typ": "JWT"},
    {"alg": "ES256", "kid": ["cle-prod"], "typ": "JWT"},
])
def test_entete_alg_ou_kid_non_texte_donne_401(header):
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(_ec_pair("cle-prod")[1]))), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        with pytest.raises(HTTPException) as exc:
            _verify(_forged(header))
        assert exc.value.status_code == 401
        # Même jeton contre les deux gardes qui répondaient 500.
        with pytest.raises(HTTPException) as exc_user:
            asyncio.run(auth.get_current_user(credentials=_creds(_forged(header)), settings=_settings()))
        assert exc_user.value.status_code == 401
        with pytest.raises(HTTPException) as exc_paid:
            asyncio.run(auth.require_paid_user_or_admin(
                credentials=_creds(_forged(header)), x_admin_token=None, settings=_settings()))
        assert exc_paid.value.status_code == 401
    fallback.assert_not_awaited()


# ---------------------------------------------------------------------------
# REV-4 — audience ABSENTE refusée (python-jose ne la refusait que fausse)
# ---------------------------------------------------------------------------

def test_jeton_hs256_sans_audience_refuse_sans_repli():
    claims = _claims(role="service_role")
    del claims["aud"]
    token = jwt.encode(claims, HS_SECRET, algorithm="HS256")
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_verify_with_supabase_auth", fallback):
        with pytest.raises(HTTPException) as exc:
            _verify(token)
    assert exc.value.status_code == 401
    fallback.assert_not_awaited()


def test_jeton_es256_sans_audience_refuse():
    pem, jwk = _ec_pair("cle-prod")
    claims = _claims()
    del claims["aud"]
    token = jwt.encode(claims, pem, algorithm="ES256", headers={"kid": "cle-prod"})
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))):
        with pytest.raises(HTTPException) as exc:
            _verify(token)
    assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# REV-3 — JWKS injoignable : un seul essai, puis pause de 30 s
#
# Constaté le 2026-10-01 (relecture) : 5 requêtes simultanées = 5
# téléchargements en série (2,5 s avec un délai de 0,5 s), et la suivante
# retentait encore.
# ---------------------------------------------------------------------------

def test_jwks_injoignable_un_seul_essai_pour_des_requetes_simultanees():
    pem, jwk = _ec_pair("cle-prod")
    token = _sign(pem, "ES256", "cle-prod")
    calls = {"n": 0}

    async def ok(url):
        calls["n"] += 1
        return _jwks(jwk)

    async def down(url):
        calls["n"] += 1
        await asyncio.sleep(0.05)
        raise OSError("JWKS injoignable")

    async def scenario(clock):
        with patch.object(auth, "_fetch_jwks", ok):
            await auth.verify_supabase_token(token, _settings())
        clock.t += auth._JWKS_TTL_SEC + 1  # cache périmé
        calls["n"] = 0
        with patch.object(auth, "_fetch_jwks", down):
            uids = await asyncio.gather(*[auth.verify_supabase_token(token, _settings()) for _ in range(5)])
            assert uids == [USER_ID] * 5  # clés en cache réutilisées
            assert calls["n"] == 1
            clock.t += 5  # pendant la pause : aucun nouvel essai
            assert await auth.verify_supabase_token(token, _settings()) == USER_ID
            assert calls["n"] == 1
        clock.t += auth._JWKS_RETRY_AFTER_FAILURE_SEC  # pause terminée : on réessaie
        with patch.object(auth, "_fetch_jwks", ok):
            assert await auth.verify_supabase_token(token, _settings()) == USER_ID
        assert calls["n"] == 2

    clock = _Clock()
    with patch.object(auth, "_monotonic", clock), \
            patch.object(auth, "_verify_with_supabase_auth", AsyncMock(return_value=None)):
        asyncio.run(scenario(clock))


def test_jwks_jamais_charge_et_injoignable_repli_direct_pendant_la_pause():
    """Sans clé en cache : pas d'attente du JWKS à chaque requête, repli direct."""
    pem, _ = _ec_pair("cle-prod")
    fetch = AsyncMock(side_effect=OSError("JWKS injoignable"))
    fallback = AsyncMock(return_value=USER_ID)
    clock = _Clock()
    with patch.object(auth, "_fetch_jwks", fetch), patch.object(auth, "_monotonic", clock), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        for _ in range(4):
            assert _verify(_sign(pem, "ES256", "cle-prod")) == USER_ID
            clock.t += 1
    assert fetch.await_count == 1
    assert fallback.await_count == 4


def test_kid_inconnu_pas_de_rechargement_force_pendant_la_pause():
    """Le rechargement périodique vient d'échouer : un `kid` inconnu ne doit pas
    relancer un téléchargement (et une attente) avant la fin de la pause."""
    pem, jwk = _ec_pair("cle-prod")
    pem_inconnue, _ = _ec_pair("autre-kid")
    fetch = AsyncMock(side_effect=[_jwks(jwk), OSError("JWKS injoignable"), _jwks(jwk)])
    clock = _Clock()
    with patch.object(auth, "_fetch_jwks", fetch), patch.object(auth, "_monotonic", clock), \
            patch.object(auth, "_verify_with_supabase_auth", AsyncMock(return_value=None)):
        _verify(_sign(pem, "ES256", "cle-prod"))               # téléchargement 1
        clock.t += auth._JWKS_TTL_SEC + 1
        assert _verify(_sign(pem, "ES256", "cle-prod")) == USER_ID  # téléchargement 2 : échec, cache servi
        clock.t += 5                                            # pause encore en cours
        with pytest.raises(HTTPException):
            _verify(_sign(pem_inconnue, "ES256", "autre-kid"))
        assert fetch.await_count == 2
        clock.t += auth._JWKS_RETRY_AFTER_FAILURE_SEC          # pause terminée
        with pytest.raises(HTTPException):
            _verify(_sign(pem_inconnue, "ES256", "autre-kid"))  # téléchargement 3, kid toujours absent
    assert fetch.await_count == 3


def test_algorithme_none_refuse():
    header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(
        ('{"sub":"%s","aud":"authenticated","exp":%d}' % (USER_ID, int(time.time()) + 60)).encode()
    ).rstrip(b"=").decode()
    with pytest.raises(HTTPException) as exc:
        _verify(f"{header}.{body}.")
    assert exc.value.status_code == 401


def test_cle_ec_annoncee_hs256_ne_contourne_pas_la_verification():
    """Confusion d'algorithme : un jeton HS256 « signé » avec la clé publique.

    La signature HS256 ne correspond pas à notre secret : c'est Supabase Auth qui
    tranche (REV-1). Ici il refuse : 401, et la clé publique n'a servi à rien."""
    _, jwk = _ec_pair("cle-prod")
    fallback = AsyncMock(return_value=None)
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))) as fetch, \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        token = jwt.encode(_claims(), jwk["x"], algorithm="HS256", headers={"kid": "cle-prod"})
        with pytest.raises(HTTPException) as exc:
            _verify(token)
    assert exc.value.status_code == 401
    fetch.assert_not_awaited()  # un jeton HS256 ne lit jamais le JWKS


# ---------------------------------------------------------------------------
# Repli /auth/v1/user : dernier recours seulement
# ---------------------------------------------------------------------------

def test_jwks_injoignable_repli_sur_supabase_auth():
    pem, _ = _ec_pair("cle-prod")
    fetch = AsyncMock(side_effect=OSError("réseau coupé"))
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_fetch_jwks", fetch), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        assert _verify(_sign(pem, "ES256", "cle-prod")) == USER_ID
    fallback.assert_awaited_once()


def test_jwks_injoignable_et_repli_negatif_refuse():
    pem, _ = _ec_pair("cle-prod")
    with patch.object(auth, "_fetch_jwks", AsyncMock(side_effect=OSError("réseau coupé"))), \
            patch.object(auth, "_verify_with_supabase_auth", AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as exc:
            _verify(_sign(pem, "ES256", "cle-prod"))
    assert exc.value.status_code == 401


def test_secret_hs256_absent_repli_sur_supabase_auth():
    fallback = AsyncMock(return_value=USER_ID)
    with patch.object(auth, "_verify_with_supabase_auth", fallback):
        token = _sign(HS_SECRET, "HS256", None)
        assert _verify(token, _settings(supabase_jwt_secret="")) == USER_ID
    fallback.assert_awaited_once()


def test_jwks_injoignable_cles_en_cache_reutilisees():
    pem, jwk = _ec_pair("cle-prod")
    fetch = AsyncMock(side_effect=[_jwks(jwk), OSError("réseau coupé")])
    fallback = AsyncMock(return_value=None)
    clock = _Clock()
    with patch.object(auth, "_fetch_jwks", fetch), patch.object(auth, "_monotonic", clock), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        _verify(_sign(pem, "ES256", "cle-prod"))
        clock.t += auth._JWKS_TTL_SEC + 1
        assert _verify(_sign(pem, "ES256", "cle-prod")) == USER_ID
    fallback.assert_not_awaited()


# ---------------------------------------------------------------------------
# Les trois gardes utilisent la même vérification
# ---------------------------------------------------------------------------

def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_get_current_user_accepte_es256():
    """Alertes et widgets IA : 401 pour tout le monde avant le correctif."""
    pem, jwk = _ec_pair("cle-prod")
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))):
        uid = asyncio.run(auth.get_current_user(
            credentials=_creds(_sign(pem, "ES256", "cle-prod")), settings=_settings()))
    assert uid == UUID(USER_ID)


def test_get_current_user_sub_non_uuid_donne_401_et_non_500():
    pem, jwk = _ec_pair("cle-prod")
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth.get_current_user(
                credentials=_creds(_sign(pem, "ES256", "cle-prod", sub="pas-un-uuid")),
                settings=_settings()))
    assert exc.value.status_code == 401


def test_require_user_or_admin_accepte_es256_sans_appel_auth_v1_user():
    pem, jwk = _ec_pair("cle-prod")
    fallback = AsyncMock(return_value=None)
    with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))), \
            patch.object(auth, "_verify_with_supabase_auth", fallback):
        ok = asyncio.run(auth.require_user_or_admin(
            credentials=_creds(_sign(pem, "ES256", "cle-prod")), x_admin_token=None,
            settings=_settings()))
    assert ok is True
    fallback.assert_not_awaited()


def test_require_user_or_admin_jeton_invalide_mais_admin_valide():
    ok = asyncio.run(auth.require_user_or_admin(
        credentials=_creds("n.importe.quoi"), x_admin_token="admin-de-test", settings=_settings()))
    assert ok is True


def test_require_paid_user_or_admin_verifie_es256_localement():
    """Le contrôle d'abonnement reçoit le bon utilisateur, sans /auth/v1/user."""
    pem, jwk = _ec_pair("cle-prod")
    fallback = AsyncMock(return_value=None)
    auth._paid_access_cache.clear()
    auth._paid_cache_set(USER_ID, True, time.time() + 60)  # abonnement déjà vérifié
    try:
        with patch.object(auth, "_fetch_jwks", AsyncMock(return_value=_jwks(jwk))), \
                patch.object(auth, "_verify_with_supabase_auth", fallback):
            ok = asyncio.run(auth.require_paid_user_or_admin(
                credentials=_creds(_sign(pem, "ES256", "cle-prod")), x_admin_token=None,
                settings=_settings()))
    finally:
        auth._paid_access_cache.clear()
    assert ok is True
    fallback.assert_not_awaited()


def test_url_jwks_derivee_de_supabase_url():
    assert auth.jwks_url_for("https://abc.supabase.co/") == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert auth.jwks_url_for("") is None
