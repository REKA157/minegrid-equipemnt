from __future__ import annotations
import logging
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import DataSource
from app.schemas import DataSourceCreate, DataSourceUpdate, DataSourceOut, IngestResult
from app.ingestion.registry import CONNECTOR_MAP
from app.ingestion.registry import run_all as run_all_from_yaml
from app.ingestion.upsert import upsert_assets
from app.ingestion.machine_upsert import upsert_machines
from app.alerts.generator import generate_alerts_after_ingest

logger = logging.getLogger("monitor.sources")

router = APIRouter(prefix="/admin/sources", tags=["sources"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[DataSourceOut])
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataSource).order_by(DataSource.created_at.desc()))
    return [DataSourceOut.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=DataSourceOut)
async def create_source(body: DataSourceCreate, db: AsyncSession = Depends(get_db)):
    if body.connector_type not in CONNECTOR_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown connector: {body.connector_type}. Available: {list(CONNECTOR_MAP.keys())}")

    source = DataSource(
        name=body.name,
        connector_type=body.connector_type,
        url=body.url,
        enabled=1 if body.enabled else 0,
        config=body.config,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return DataSourceOut.model_validate(source)


@router.get("/{source_id}", response_model=DataSourceOut)
async def get_source(source_id: UUID, db: AsyncSession = Depends(get_db)):
    source = (await db.execute(select(DataSource).where(DataSource.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source non trouvée")
    return DataSourceOut.model_validate(source)


@router.patch("/{source_id}", response_model=DataSourceOut)
async def update_source(source_id: UUID, body: DataSourceUpdate, db: AsyncSession = Depends(get_db)):
    source = (await db.execute(select(DataSource).where(DataSource.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source non trouvée")

    if body.name is not None:
        source.name = body.name
    if body.url is not None:
        source.url = body.url
    if body.enabled is not None:
        source.enabled = 1 if body.enabled else 0
    if body.config is not None:
        source.config = body.config

    await db.commit()
    await db.refresh(source)
    return DataSourceOut.model_validate(source)


@router.delete("/{source_id}")
async def delete_source(source_id: UUID, db: AsyncSession = Depends(get_db)):
    source = (await db.execute(select(DataSource).where(DataSource.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source non trouvée")
    await db.delete(source)
    await db.commit()
    return {"deleted": True}


@router.post("/{source_id}/run", response_model=IngestResult)
async def run_source(source_id: UUID, db: AsyncSession = Depends(get_db)):
    """Run a single source's connector and update its stats."""
    source = (await db.execute(select(DataSource).where(DataSource.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source non trouvée")

    cls = CONNECTOR_MAP.get(source.connector_type)
    if not cls:
        raise HTTPException(status_code=400, detail=f"Unknown connector: {source.connector_type}")

    logger.info("Running source: %s (%s)", source.name, source.connector_type)
    try:
        connector = cls(config=source.config or {})
        if source.connector_type in ("mascus", "leboncoin"):
            # Mascus writes into the marketplace catalog (`machines`) via Supabase REST.
            machines = await connector.fetch_machines()
            result = await upsert_machines(machines)
        else:
            assets = await connector.fetch()
            result = await upsert_assets(db, assets)

        source.last_run_at = datetime.utcnow()
        source.stats = {
            "inserted": result.inserted,
            "updated": result.updated,
            "skipped": result.skipped,
            "errors": result.errors,
            "last_details": result.details[:10],
        }
        await db.commit()

        logger.info("Source %s: inserted=%d updated=%d errors=%d", source.name, result.inserted, result.updated, result.errors)
        if source.connector_type not in ("mascus", "leboncoin"):
            # Alertes dès la fin de l'ingestion (constaté le 2026-10-01 : 6 h
            # d'attente). Les connecteurs machines n'alimentent pas les projets.
            await generate_alerts_after_ingest(db, result)
        return result

    except Exception as exc:
        logger.exception("Source run failed: %s", source.name)
        source.last_run_at = datetime.utcnow()
        source.stats = {"error": str(exc)}
        await db.commit()
        raise HTTPException(status_code=500, detail="Erreur interne lors de l'exécution de la source")


@router.post("/run-all")
async def run_all_sources(db: AsyncSession = Depends(get_db)):
    """Run all enabled sources and return grouped diagnostics."""
    rows = (
        await db.execute(
            select(DataSource)
            .where(DataSource.enabled == 1)
            .order_by(DataSource.created_at.desc())
        )
    ).scalars().all()

    summary = {
        "total_sources": len(rows),
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
        "by_connector": {},
        "details": [],
    }

    # Fallback: if no sources are configured in DB, execute the YAML registry directly.
    if len(rows) == 0:
        yaml_result = await run_all_from_yaml(db)
        await generate_alerts_after_ingest(db, yaml_result)
        return {
            "total_sources": 0,
            "inserted": yaml_result.inserted,
            "updated": yaml_result.updated,
            "skipped": yaml_result.skipped,
            "errors": yaml_result.errors,
            "by_connector": {},
            "details": yaml_result.details or [],
            "mode": "yaml_fallback",
        }

    # Projets (pas machines) insérés/mis à jour : décide de la génération d'alertes.
    projects_changed = IngestResult()

    for source in rows:
        try:
            cls = CONNECTOR_MAP.get(source.connector_type)
            if not cls:
                raise RuntimeError(f"Unknown connector: {source.connector_type}")

            connector = cls(config=source.config or {})
            if source.connector_type in ("mascus", "leboncoin"):
                from app.ingestion.machine_upsert import upsert_machines

                machines = await connector.fetch_machines()
                result = await upsert_machines(machines)
            else:
                assets = await connector.fetch()
                result = await upsert_assets(db, assets)
                projects_changed.inserted += result.inserted
                projects_changed.updated += result.updated

            source.last_run_at = datetime.utcnow()
            source.stats = {
                "inserted": result.inserted,
                "updated": result.updated,
                "skipped": result.skipped,
                "errors": result.errors,
                "last_details": (result.details or [])[:10],
            }

            summary["inserted"] += result.inserted
            summary["updated"] += result.updated
            summary["skipped"] += result.skipped
            summary["errors"] += result.errors
            summary["details"].append(
                {
                    "source": source.name,
                    "connector_type": source.connector_type,
                    "inserted": result.inserted,
                    "updated": result.updated,
                    "skipped": result.skipped,
                    "errors": result.errors,
                }
            )

            key = source.connector_type
            if key not in summary["by_connector"]:
                summary["by_connector"][key] = {"inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
            summary["by_connector"][key]["inserted"] += result.inserted
            summary["by_connector"][key]["updated"] += result.updated
            summary["by_connector"][key]["skipped"] += result.skipped
            summary["by_connector"][key]["errors"] += result.errors

        except Exception as exc:
            summary["errors"] += 1
            summary["details"].append(
                {
                    "source": source.name,
                    "connector_type": source.connector_type,
                    "error": str(exc),
                }
            )
            source.last_run_at = datetime.utcnow()
            source.stats = {"error": str(exc)}

    await db.commit()
    await generate_alerts_after_ingest(db, projects_changed)
    return summary
