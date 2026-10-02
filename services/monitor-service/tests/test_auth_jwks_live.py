"""Preuve en LECTURE SEULE : le JWKS réel du projet Supabase se charge et se parse.

Ignoré dans la suite normale (aucune dépendance réseau). Pour l'exécuter :
    MONITOR_LIVE_JWKS_SUPABASE_URL=https://<ref>.supabase.co python -m pytest -q tests/test_auth_jwks_live.py

Seul le JWKS PUBLIC est lu (GET, aucune clé envoyée, aucune écriture). Le test
passe par le vrai code (_fetch_jwks → _JwksCache → jose) et vérifie qu'un jeton
portant le `kid` de production mais signé par une autre clé est REFUSÉ par la
clé publique réelle : la clé est donc bien chargée ET utilisée.
"""
from __future__ import annotations

import asyncio
import os
import time
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwk as jose_jwk
from jose import jwt

import app.auth as auth

LIVE_URL = os.environ.get("MONITOR_LIVE_JWKS_SUPABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not LIVE_URL, reason="MONITOR_LIVE_JWKS_SUPABASE_URL non défini (sonde réseau manuelle)"
)


def test_jwks_reel_charge_parse_et_utilise():
    auth._jwks_cache.reset()
    url = auth.jwks_url_for(LIVE_URL)

    data = asyncio.run(auth._fetch_jwks(url))
    keys = data["keys"]
    assert keys, "JWKS vide"
    summary = [(k.get("alg"), k.get("kty"), k.get("crv"), bool(k.get("kid"))) for k in keys]
    print(f"\nJWKS réel : {len(keys)} clé(s) -> {summary}")

    asym = [k for k in keys if k.get("alg") in auth._ASYMMETRIC_ALGS]
    assert asym, "aucune clé ES256/RS256 publiée"
    real = asym[0]

    # 1) Le cache du service retrouve la clé par son kid.
    found = asyncio.run(auth._jwks_cache.get_key(url, real["kid"], real["alg"]))
    assert found is not None and found["kid"] == real["kid"]

    # 2) jose construit une clé publique utilisable à partir de la JWK réelle.
    public_key = jose_jwk.construct(found, real["alg"])
    assert public_key.is_public()

    # 3) Un jeton au kid de production signé par une AUTRE clé est refusé.
    if real["alg"] == "ES256":
        other = ec.generate_private_key(ec.SECP256R1()).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        forged = jwt.encode(
            {"sub": "00000000-0000-0000-0000-000000000000", "aud": "authenticated",
             "exp": int(time.time()) + 60},
            other, algorithm="ES256", headers={"kid": real["kid"]},
        )
        settings = SimpleNamespace(
            supabase_url=LIVE_URL, supabase_jwt_secret="", supabase_service_role_key="",
            admin_token="",
        )
        with pytest.raises(auth._TokenRejected):
            asyncio.run(auth._verify_locally(forged, settings))
    auth._jwks_cache.reset()
