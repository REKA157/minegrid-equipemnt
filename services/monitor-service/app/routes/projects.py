from __future__ import annotations
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.auth import require_user_or_admin
from app.models import Project
from app.schemas import ProjectOut, ProjectDetailOut, ProjectListOut, EquipmentNeedOut
from app.rules.engine import compute_equipment_needs
from app.llm.enrichment import enrich_project, compare_project_methods
from app.config import get_settings

router = APIRouter(prefix="/projects", tags=["projects"])

_NON_MACHINE_TITLE_KEYWORDS = {
    "textile", "cuir", "caoutchouc", "plastique", "assurance", "audit",
    "formation", "documentation", "imprim", "nettoyage", "gardiennage",
    "restauration", "fourniture", "produits", "pharmaceutique", "médical",
    "medica", "sport", "articles artistiques", "services courants",
}


@router.get("", response_model=ProjectListOut)
async def list_projects(
    country: str | None = Query(None),
    type: str | None = Query(None),
    phase: str | None = Query(None),
    source_kind: str | None = Query(None, pattern="^(public|mdb)$"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user_ok: bool = Depends(require_user_or_admin),
):
    query = select(Project)
    count_query = select(func.count(Project.id))

    if country:
        query = query.where(Project.country == country)
        count_query = count_query.where(Project.country == country)
    if type:
        query = query.where(Project.type == type)
        count_query = count_query.where(Project.type == type)
    if phase:
        query = query.where(Project.phase == phase)
        count_query = count_query.where(Project.phase == phase)
    if source_kind == "public":
        query = query.where(Project.source.ilike("Public Portal%"))
        count_query = count_query.where(Project.source.ilike("Public Portal%"))
    elif source_kind == "mdb":
        query = query.where(Project.source.ilike("MDB - %"))
        count_query = count_query.where(Project.source.ilike("MDB - %"))
    if search:
        pattern = f"%{search}%"
        query = query.where(Project.title.ilike(pattern))
        count_query = count_query.where(Project.title.ilike(pattern))

    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(Project.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = result.scalars().all()

    return ProjectListOut(
        items=[ProjectOut.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{project_id}", response_model=ProjectDetailOut)
async def get_project(
    project_id: UUID,
    ai: bool = Query(False, description="Enrichir les besoins machines via IA"),
    force_ai: bool = Query(False, description="Forcer le recalcul IA même si des besoins existent"),
    db: AsyncSession = Depends(get_db),
    _user_ok: bool = Depends(require_user_or_admin),
):
    query = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.documents),
            selectinload(Project.entities),
            selectinload(Project.contacts),
            selectinload(Project.equipment_needs),
        )
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    settings = get_settings()
    if ai and settings.llm_provider.lower() != "none":
        # Par défaut : enrichir seulement si aucun besoin en base (évite d'écraser
        # une analyse déjà stockée à chaque ouverture du détail). `force_ai=true`
        # force un recalcul LLM (admin / bouton explicite).
        has_equipment = bool(project.equipment_needs)
        should_enrich = force_ai or not has_equipment
        if should_enrich:
            try:
                await enrich_project(db, project)
                # Reload updated relations after enrichment
                result = await db.execute(query)
                project = result.scalar_one_or_none() or project
            except Exception:
                # Keep endpoint resilient: fallback logic below still applies.
                pass

    detail = ProjectDetailOut.model_validate(project)

    title_lower = (project.title or "").lower()
    is_non_machine_project = any(k in title_lower for k in _NON_MACHINE_TITLE_KEYWORDS)

    # Fallback: if no equipment_needs in DB, compute via rules engine
    if not detail.equipment_needs and project.type and project.phase and not is_non_machine_project:
        estimates = compute_equipment_needs(
            project_type=project.type,
            phase=project.phase,
            budget_usd=Decimal(str(project.budget_usd)) if project.budget_usd else None,
        )
        detail.equipment_needs = [
            EquipmentNeedOut(
                id=UUID(int=0),
                category=e.category,
                qty_min=e.qty_min,
                qty_max=e.qty_max,
                confidence=e.confidence,
                rationale=f"[estimated] {e.rationale}",
                created_at=project.updated_at or detail.updated_at,
            )
            for e in estimates
            if e.qty_max > 0
        ]

    return detail


@router.get("/{project_id}/analysis-compare")
async def get_project_analysis_compare(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user_ok: bool = Depends(require_user_or_admin),
):
    """
    Compare extraction déterministe AO vs estimation LLM pour un projet.
    Endpoint lecture seule (aucune écriture DB), accessible aux utilisateurs authentifiés.
    """
    query = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.documents),
            selectinload(Project.entities),
            selectinload(Project.contacts),
            selectinload(Project.equipment_needs),
        )
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    return await compare_project_methods(project)
