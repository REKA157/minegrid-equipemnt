"""GET /health expose la version de build (commit + date).

Constaté le 2026-10-01 : le radar en ligne était antérieur aux gardes de
paywall du dépôt (commit 4b27cfc6) et rien ne permettait de le voir.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import health

ROOT = Path(__file__).resolve().parent.parent


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(health.router)
    return TestClient(app)


def test_health_expose_le_commit_et_la_date_de_build(monkeypatch):
    monkeypatch.setenv("BUILD_SHA", "4b27cfc")
    monkeypatch.setenv("BUILD_DATE", "2026-10-01T09:00:00Z")
    body = _client().get("/health").json()
    assert body["build_sha"] == "4b27cfc"
    assert body["build_date"] == "2026-10-01T09:00:00Z"


def test_health_inconnue_par_defaut_et_schema_historique_conserve(monkeypatch):
    monkeypatch.delenv("BUILD_SHA", raising=False)
    monkeypatch.setenv("BUILD_DATE", "   ")
    res = _client().get("/health")
    assert res.status_code == 200
    body = res.json()
    # Champs historiques inchangés : aucun client existant ne casse.
    assert body["status"] == "ok"
    assert body["version"] == "1.0.0"
    assert body["service"] == "monitor-service"
    assert body["build_sha"] == "inconnue"
    assert body["build_date"] == "inconnue"


def test_dockerfile_pose_les_variables_de_build():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "ARG BUILD_SHA=inconnue" in dockerfile
    assert "ARG BUILD_DATE=inconnue" in dockerfile
    assert "BUILD_SHA=${BUILD_SHA}" in dockerfile
    assert "BUILD_DATE=${BUILD_DATE}" in dockerfile
    # Après le pip install : un nouveau commit ne doit pas invalider ce cache.
    assert dockerfile.index("ARG BUILD_SHA") > dockerfile.index("pip install")


def test_compose_prod_transmet_les_variables_de_build():
    compose = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    assert "BUILD_SHA: ${BUILD_SHA:-inconnue}" in compose
    assert "BUILD_DATE: ${BUILD_DATE:-inconnue}" in compose
