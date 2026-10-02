"""
Attente bornée de la base de données au démarrage.

Constaté le 2026-10-01 : le conteneur local `monitor-service-monitor-api-1`
affichait RestartCount=16134. Au démarrage, la vérification du schéma ouvrait
une connexion alors que le nom d'hôte de la base n'était pas encore résolvable
(`socket.gaierror: [Errno -2] Name or service not known`, levée par asyncpg) ;
le processus mourait aussitôt (« Application startup failed. Exiting. ») et
Docker le relançait, en boucle.

Règle appliquée :
  - erreur de CONNEXION (nom introuvable, connexion refusée, délai dépassé,
    base « en cours de démarrage ») → on réessaie, avec des pauses croissantes,
    pendant au plus ~60 s (MONITOR_DB_WAIT_SECONDS), puis on abandonne ;
  - toute AUTRE erreur — en particulier une base joignable mais NON MIGRÉE, un
    mot de passe refusé, une base inexistante — → arrêt IMMÉDIAT : attendre ne
    corrigera rien, et servir du trafic sur un schéma incohérent est pire que
    de ne pas démarrer.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Awaitable, Callable

logger = logging.getLogger("monitor.startup")

DEFAULT_MAX_WAIT_SEC = 60.0
# Pauses entre deux essais : 1, 2, 4, 8 puis 10 s (≈ 60 s en 9 essais).
_BACKOFF_SEC = (1.0, 2.0, 4.0, 8.0)
_BACKOFF_CAP_SEC = 10.0

# Noms des exceptions asyncpg qui signifient « réessayez dans un instant ».
# Comparés par nom pour ne pas importer asyncpg ici (testable sans pilote).
_TRANSIENT_DRIVER_ERRORS = {"CannotConnectNowError", "ConnectionDoesNotExistError"}
_FILESYSTEM_ERRORS = (
    FileNotFoundError, FileExistsError, IsADirectoryError, NotADirectoryError, PermissionError,
)


class SchemaNotCurrentError(RuntimeError):
    """Base joignable mais pas à la dernière révision Alembic : jamais réessayé."""


def _iter_chain(exc: BaseException):
    """L'exception, ses causes (`raise … from`), son contexte et `.orig` (SQLAlchemy)."""
    seen: set[int] = set()
    stack = [exc]
    while stack:
        cur = stack.pop()
        if cur is None or id(cur) in seen:
            continue
        seen.add(id(cur))
        yield cur
        stack.extend([cur.__cause__, cur.__context__, getattr(cur, "orig", None)])


def is_transient_connection_error(exc: BaseException) -> bool:
    """Vrai si l'erreur dit « base pas encore joignable » (et rien d'autre)."""
    for cur in _iter_chain(exc):
        if isinstance(cur, SchemaNotCurrentError):
            return False
    for cur in _iter_chain(exc):
        # socket.gaierror, ConnectionRefusedError, ConnectionResetError,
        # TimeoutError (asyncio.TimeoutError en est un alias en 3.11) et l'OSError
        # « Multiple exceptions: Connect call failed… » d'asyncio sont des OSError.
        # Les erreurs de FICHIER (alembic.ini absent, droits) en sont aussi, mais
        # attendre ne les corrigera pas : arrêt immédiat.
        if isinstance(cur, _FILESYSTEM_ERRORS):
            return False
        if isinstance(cur, (OSError, asyncio.TimeoutError)):
            return True
        if type(cur).__name__ in _TRANSIENT_DRIVER_ERRORS:
            return True
    return False


def _max_wait_from_env() -> float:
    raw = os.environ.get("MONITOR_DB_WAIT_SECONDS", "")
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_MAX_WAIT_SEC
    return value if value >= 0 else DEFAULT_MAX_WAIT_SEC


async def wait_for_database(
    check: Callable[[], Awaitable[None]],
    *,
    max_wait_sec: float | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> None:
    """Exécute `check` ; réessaie seulement sur erreur de connexion, ≤ max_wait_sec."""
    limit = _max_wait_from_env() if max_wait_sec is None else max_wait_sec
    started = clock()
    attempt = 0
    while True:
        attempt += 1
        try:
            await check()
            if attempt > 1:
                logger.info("Base de données joignable après %d tentative(s).", attempt)
            return
        except Exception as exc:
            if not is_transient_connection_error(exc):
                raise
            elapsed = clock() - started
            remaining = limit - elapsed
            if remaining <= 0:
                logger.error(
                    "Base de données toujours injoignable après %.0f s (%d tentatives, "
                    "dernière erreur : %s: %s). Arrêt du service : vérifiez que le "
                    "conteneur Postgres tourne et que DATABASE_URL est correcte.",
                    elapsed, attempt, type(exc).__name__, exc,
                )
                raise
            delay = _BACKOFF_SEC[attempt - 1] if attempt <= len(_BACKOFF_SEC) else _BACKOFF_CAP_SEC
            delay = min(delay, remaining)
            logger.warning(
                "Base de données pas encore joignable (tentative %d, %s: %s). "
                "Nouvel essai dans %.0f s (attente maximale %.0f s).",
                attempt, type(exc).__name__, exc, delay, limit,
            )
            await sleep(delay)
