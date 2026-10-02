"""Attente bornée de la base au démarrage (boucle de redémarrages).

Constaté le 2026-10-01 : RestartCount=16134 sur le conteneur local. Au
démarrage, la vérification du schéma levait socket.gaierror (nom d'hôte de la
base pas encore résolvable) et le processus mourait aussitôt.
"""
from __future__ import annotations

import asyncio
import socket

import pytest

from app.startup import (
    SchemaNotCurrentError,
    is_transient_connection_error,
    wait_for_database,
)


class _FakeTime:
    """Horloge et sommeil factices : aucun vrai délai dans les tests."""

    def __init__(self):
        self.now = 0.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def _check_failing(errors):
    calls = {"n": 0}

    async def check():
        calls["n"] += 1
        if errors:
            raise errors.pop(0)

    return check, calls


def _run(check, fake, max_wait=60.0):
    return asyncio.run(
        wait_for_database(check, max_wait_sec=max_wait, sleep=fake.sleep, clock=fake.clock)
    )


def test_base_pas_encore_resolvable_puis_disponible_demarre():
    fake = _FakeTime()
    check, calls = _check_failing([
        socket.gaierror(-2, "Name or service not known"),
        ConnectionRefusedError(111, "Connect call failed"),
    ])
    _run(check, fake)
    assert calls["n"] == 3
    assert fake.sleeps == [1.0, 2.0]


def test_schema_non_migre_refuse_immediatement_sans_attente():
    fake = _FakeTime()
    check, calls = _check_failing([SchemaNotCurrentError("Schema non migre")])
    with pytest.raises(SchemaNotCurrentError):
        _run(check, fake)
    assert calls["n"] == 1
    assert fake.sleeps == []


def test_base_injoignable_abandon_apres_le_delai_maximal():
    fake = _FakeTime()

    async def check():
        raise socket.gaierror(-2, "Name or service not known")

    with pytest.raises(socket.gaierror):
        _run(check, fake, max_wait=60.0)
    assert sum(fake.sleeps) == pytest.approx(60.0)
    assert max(fake.sleeps) <= 10.0
    assert len(fake.sleeps) < 15  # reprises espacées, pas une rafale


def test_erreur_non_reseau_non_reessayee():
    fake = _FakeTime()
    check, calls = _check_failing([ValueError("mot de passe refusé")])
    with pytest.raises(ValueError):
        _run(check, fake)
    assert calls["n"] == 1 and fake.sleeps == []


def test_classification_des_erreurs():
    assert is_transient_connection_error(socket.gaierror(-2, "x"))
    assert is_transient_connection_error(ConnectionRefusedError())
    assert is_transient_connection_error(TimeoutError())
    assert is_transient_connection_error(OSError("Multiple exceptions: Connect call failed"))

    class CannotConnectNowError(Exception):  # même nom que l'exception asyncpg
        pass

    assert is_transient_connection_error(CannotConnectNowError("the database system is starting up"))

    # Erreur enveloppée (SQLAlchemy : `.orig`, ou `raise ... from`).
    wrapped = RuntimeError("connexion")
    wrapped.orig = socket.gaierror(-2, "x")
    assert is_transient_connection_error(wrapped)

    assert not is_transient_connection_error(SchemaNotCurrentError("non migré"))
    assert not is_transient_connection_error(FileNotFoundError("alembic.ini"))
    assert not is_transient_connection_error(ValueError("autre"))


def test_lifespan_utilise_l_attente_bornee(monkeypatch):
    """Le démarrage réel passe bien par wait_for_database (pas d'appel direct)."""
    import app.main as main

    seen = {}

    async def fake_wait(check, **kw):
        seen["check"] = check

    monkeypatch.setattr(main, "wait_for_database", fake_wait)
    monkeypatch.setattr(main, "start_scheduler", lambda: None)
    monkeypatch.setattr(main, "stop_scheduler", lambda: None)

    async def run():
        async with main.lifespan(main.app):
            pass

    asyncio.run(run())
    assert seen["check"] is main._verify_schema_is_current


def test_migration_auto_dans_un_fil_et_sans_fichier_ini(monkeypatch):
    """MONITOR_AUTO_MIGRATE=1 : deux défauts constatés le 2026-10-01 en essai réel.

    - command.upgrade appelé dans la boucle d'uvicorn : alembic/env.py fait
      asyncio.run() → « cannot be called from a running event loop » ;
    - Config(alembic.ini) : env.py appelle fileConfig(), qui désactivait tous les
      journaux (plus aucun message de démarrage ni d'erreur).
    """
    import threading

    import alembic.command
    import app.main as main

    seen = {}

    def fake_upgrade(cfg, rev):
        seen["thread"] = threading.current_thread() is threading.main_thread()
        seen["ini"] = cfg.config_file_name
        seen["script_location"] = cfg.get_main_option("script_location")
        seen["rev"] = rev

    monkeypatch.setenv("MONITOR_AUTO_MIGRATE", "1")
    monkeypatch.setattr(alembic.command, "upgrade", fake_upgrade)
    asyncio.run(main._verify_schema_is_current())
    assert seen["thread"] is False          # hors de la boucle principale
    assert seen["ini"] is None              # pas de fileConfig() dans env.py
    assert seen["script_location"].endswith("alembic")
    assert seen["rev"] == "head"
