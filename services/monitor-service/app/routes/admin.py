from __future__ import annotations
import csv
import io
import logging
from decimal import Decimal, InvalidOperation
from datetime import date
from typing import Any
from fastapi import APIRouter, Depends, UploadFile, File, Body
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.schemas import IngestResult
from app.ingestion.asset import ProjectAsset
from app.ingestion.upsert import upsert_assets
from app.ingestion.registry import run_all
from app.llm.enrichment import enrich_projects_batch, analyze_project_debug, compare_project_methods
from app.alerts.generator import generate_alert_events
from app.models import Project
from sqlalchemy import select
from uuid import UUID

logger = logging.getLogger("monitor.admin")

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---- Run all configured connectors ----

@router.post("/ingest/run", response_model=IngestResult)
async def run_ingest(db: AsyncSession = Depends(get_db)):
    """Trigger a manual ingestion run across all enabled connectors."""
    logger.info("Manual ingest triggered")
    result = await run_all(db)
    logger.info(
        "Ingest complete: inserted=%d updated=%d errors=%d",
        result.inserted, result.updated, result.errors,
    )
    return result


# ---- CSV import ----

def _safe_decimal(val: str) -> Decimal | None:
    if not val:
        return None
    try:
        return Decimal(val.replace(",", "").replace("$", "").strip())
    except (InvalidOperation, ValueError):
        return None


def _safe_date(val: str) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(val.strip())
    except ValueError:
        return None


def _safe_float(val: str) -> float | None:
    if not val:
        return None
    try:
        return float(val.strip())
    except ValueError:
        return None


@router.post("/import/csv", response_model=IngestResult)
async def import_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Import projects from a CSV file."""
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    assets: list[ProjectAsset] = []
    for row in reader:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        assets.append(ProjectAsset(
            title=title,
            country=row.get("country", ""),
            region=row.get("region", ""),
            type=row.get("type", ""),
            phase=row.get("phase", ""),
            lat=_safe_float(row.get("lat", "")),
            lon=_safe_float(row.get("lon", "")),
            budget_usd=_safe_decimal(row.get("budget_usd", "")),
            start_date=_safe_date(row.get("start_date", "")),
            end_date=_safe_date(row.get("end_date", "")),
            source=row.get("source", "csv_import"),
            source_url=row.get("source_url", ""),
            raw=dict(row),
            confidence=Decimal("0.6"),
        ))

    result = await upsert_assets(db, assets)
    logger.info("CSV import: %d rows -> inserted=%d updated=%d", len(assets), result.inserted, result.updated)
    return result


# ---- JSON partner import ----

@router.post("/import/json", response_model=IngestResult)
async def import_json(
    payload: list[dict[str, Any]] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Import projects from a JSON payload (partner push)."""
    assets: list[ProjectAsset] = []
    for item in payload:
        title = (item.get("title") or "").strip()
        if not title:
            continue
        assets.append(ProjectAsset(
            title=title,
            country=item.get("country", ""),
            region=item.get("region", ""),
            type=item.get("type", ""),
            phase=item.get("phase", ""),
            lat=item.get("lat"),
            lon=item.get("lon"),
            budget_usd=_safe_decimal(str(item["budget_usd"])) if item.get("budget_usd") else None,
            start_date=_safe_date(item.get("start_date", "")),
            end_date=_safe_date(item.get("end_date", "")),
            source=item.get("source", "partner_import"),
            source_url=item.get("source_url", ""),
            raw=item,
            confidence=Decimal(str(item.get("confidence", "0.7"))),
        ))

    result = await upsert_assets(db, assets)
    logger.info("JSON import: %d items -> inserted=%d updated=%d", len(assets), result.inserted, result.updated)
    return result


# ---- LLM enrichment ----

@router.post("/enrich/run")
async def run_enrichment(
    limit: int = 50,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Trigger LLM enrichment on projects without equipment_needs."""
    logger.info("LLM enrichment triggered (limit=%d, force=%s)", limit, force)
    results = await enrich_projects_batch(db, limit=limit, force=force)
    logger.info("Enrichment complete: %d projects processed", len(results))
    return {"processed": len(results), "results": results}


# ---- Alert generation ----

@router.post("/alerts/generate")
async def run_alert_generation(
    since_hours: int = 24,
    db: AsyncSession = Depends(get_db),
):
    """Trigger alert event generation against recent projects."""
    logger.info("Alert generation triggered (since=%dh)", since_hours)
    result = await generate_alert_events(db, since_hours=since_hours)
    logger.info("Alert generation complete: %s", result)
    return result


@router.get("/projects/{project_id}/analysis-debug")
async def project_analysis_debug(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only debug proof that IA analyzed this project.
    Returns model/tokens/context hash and equipment preview.
    """
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        return {"error": "project_not_found", "project_id": str(project_id)}
    return await analyze_project_debug(project)


@router.get("/projects/{project_id}/analysis-compare")
async def project_analysis_compare(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Admin QA: compare deterministic extraction vs LLM (no DB write).
    Helps measure how much AI adds beyond tender text extraction.
    """
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        return {"error": "project_not_found", "project_id": str(project_id)}
    return await compare_project_methods(project)
