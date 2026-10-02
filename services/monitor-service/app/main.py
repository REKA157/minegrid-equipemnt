import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base
from app.scheduler import start_scheduler, stop_scheduler
from app.startup import SchemaNotCurrentError, wait_for_database
from app.routes import health, projects, admin, alerts, sources, mascus, leboncoin, ai_widgets

settings = get_settings()

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


async def _verify_schema_is_current() -> None:
    """Verifie que la base est a la derniere revision Alembic.

    En developpement (MONITOR_AUTO_MIGRATE=1), applique les migrations pour
    garder un demarrage sans ceremonie. En dehors, on ne fait que constater :
    migrer automatiquement en production est une course entre workers.
    """
    import os
    from alembic import command
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Configuration construite SANS le fichier alembic.ini. Constaté le
    # 2026-10-01 : avec le fichier, alembic/env.py appelle fileConfig(), qui
    # DÉSACTIVE tous les journaux déjà créés (monitor.*, uvicorn) : plus aucun
    # message de démarrage ni d'erreur. Seuls script_location et l'URL servent.
    cfg = Config()
    cfg.set_main_option("script_location", os.path.join(root, "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)

    if os.environ.get("MONITOR_AUTO_MIGRATE") == "1":
        # Dans un fil séparé : alembic/env.py appelle asyncio.run(), interdit
        # dans la boucle déjà lancée par uvicorn (« asyncio.run() cannot be
        # called from a running event loop »). Constaté le 2026-10-01 à la
        # lecture : ce chemin de développement ne pouvait pas fonctionner.
        await asyncio.to_thread(command.upgrade, cfg, "head")
        return

    head = ScriptDirectory.from_config(cfg).get_current_head()

    def _current(conn):
        return MigrationContext.configure(conn).get_current_revision()

    async with engine.begin() as conn:
        current = await conn.run_sync(_current)

    if current != head:
        # Classe dédiée : wait_for_database ne la réessaie JAMAIS (une base
        # joignable mais non migrée doit refuser de démarrer immédiatement).
        raise SchemaNotCurrentError(
            f"Schema non migre : base a la revision {current!r}, attendu {head!r}. "
            "Executez `alembic upgrade head` avant de demarrer le service."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # MG-M11 — `create_all` a ete RETIRE du demarrage.
    #
    # Il creait les tables manquantes mais n'appliquait JAMAIS d'evolution :
    # une colonne ajoutee, un type modifie, une contrainte ajoutee n'etaient
    # jamais propages. Le schema derivait silencieusement, sans historique ni
    # possibilite de rollback, et la restauration n'etait pas reproductible.
    #
    # Les migrations Alembic font desormais foi. Elles ne sont PAS jouees au
    # demarrage : avec plusieurs workers, chacun tenterait de migrer en
    # parallele. Elles s'appliquent au deploiement (`alembic upgrade head`).
    # Ici on se contente de VERIFIER, et de refuser de demarrer sur un schema
    # non migre plutot que de servir du trafic sur une base incoherente.
    #
    # Constate le 2026-10-01 : RestartCount=16134 sur le conteneur local. La
    # base n'etait pas encore resolvable au demarrage (socket.gaierror) et le
    # processus mourait aussitot. On attend desormais la base au plus ~60 s
    # (MONITOR_DB_WAIT_SECONDS), en reessayant UNIQUEMENT sur les erreurs de
    # connexion ; un schema non migre arrete toujours le service tout de suite.
    await wait_for_database(_verify_schema_is_current)
    start_scheduler()
    yield
    stop_scheduler()
    await engine.dispose()


app = FastAPI(
    title="Minegrid Monitor Service",
    version="1.0.0",
    description="Backend pour le Global Monitor — ingestion, projets, alertes",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://localhost(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Token"],
)

app.include_router(health.router)
app.include_router(projects.router)
app.include_router(admin.router)
app.include_router(alerts.router)
app.include_router(sources.router)
app.include_router(mascus.router)
app.include_router(leboncoin.router)
app.include_router(ai_widgets.router)