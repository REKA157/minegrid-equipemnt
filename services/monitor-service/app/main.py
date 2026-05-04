import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base
from app.scheduler import start_scheduler, stop_scheduler
from app.routes import health, projects, admin, alerts, sources, mascus, leboncoin, ai_widgets

settings = get_settings()

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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