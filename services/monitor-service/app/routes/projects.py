from __future__ import annotations
import time
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.auth import require_paid_user_or_admin, get_current_user
from app.ai_rate_limit import check_ai_widget_rate_limit
from app.models import Project
from app.schemas import ProjectOut, ProjectDetailOut, ProjectListOut, EquipmentNeedOut
from app.rules.engine import compute_equipment_needs
from app.llm.enrichment import enrich_project, compare_project_methods
from app.llm.client import llm_is_simulated
from app.config import get_settings, Settings
from app.auth import bearer_scheme
from app.text_fold import fold_sql, fold_text

router = APIRouter(prefix="/projects", tags=["projects"])

_NON_MACHINE_TITLE_KEYWORDS = {
    "textile", "cuir", "caoutchouc", "plastique", "assurance", "audit",
    "formation", "documentation", "imprim", "nettoyage", "gardiennage",
    "restauration", "fourniture", "produits", "pharmaceutique", "médical",
    "medica", "sport", "articles artistiques", "services courants",
}


# ---------------------------------------------------------------------------
# MG-H09 - Garde entitlement sur TOUT chemin LLM.
#
# AVANT : `GET /projects/{id}?ai=true&force_ai=true` n'exigeait que
#         require_user_or_admin. N'importe quel JWT Supabase valide declenchait
#         donc un appel LLM facturable, sans quota ni rate limit - alors que les
#         widgets IA equivalents, eux, exigeaient un compte payant.
#         Consequence : contournement du premium et DoS economique par simple
#         boucle GET.
# APRES : le paywall + le rate limit s'appliquent AVANT tout appel LLM.
#
# Mise a jour du 2026-10-01 : la liste et le detail sont desormais eux aussi
# reserves aux formules payantes (voir PAYWALL plus bas). Cette garde reste
# appelee avant tout appel LLM pour le QUOTA, et par defense en profondeur
# (le resultat de la verification d'abonnement est en cache 60 s : pas de
# second appel reseau).
# ---------------------------------------------------------------------------
async def _enforce_llm_entitlement(request: Request, settings: Settings) -> None:
    """Verifie formule payante + quota. Leve 401/402/403/429 le cas echeant
    (503 si la plateforme ne permet pas de verifier l'abonnement)."""
    credentials = await bearer_scheme(request)

    # 1) Entitlement : admin par token, sinon formule payante active.
    await require_paid_user_or_admin(
        credentials=credentials,
        x_admin_token=request.headers.get("X-Admin-Token"),
        settings=settings,
    )

    # 2) Quota : meme plafond que les widgets IA. Un compte payant ne doit pas
    #    pouvoir boucler indefiniment sur un endpoint LLM non borne.
    try:
        user_id = await get_current_user(credentials=credentials, settings=settings)
    except HTTPException:
        # Acces admin par X-Admin-Token : pas de JWT utilisateur a limiter.
        return
    check_ai_widget_rate_limit(
        f"project-enrich:{user_id}",
        max_per_minute=settings.ai_project_enrich_max_per_minute,
    )


# ---------------------------------------------------------------------------
# PAYWALL - constate le 2026-10-01 : GET /projects et GET /projects/{id}
# n'exigeaient que require_user_or_admin. N'importe quel compte GRATUIT lisait
# donc tout le radar en appelant l'API en direct, alors que le site reserve ces
# pages aux formules payantes (App.tsx : paidRoute('premium') pour
# #global-monitor et #opportunites-vente ; paidRoute('enterprise') pour les
# cockpits qui lisent /projects/{id} via buildMonitorContextForLeadSourceIds).
# Verifie dans src/ : aucun ecran accessible a un non-payant n'appelle
# fetchProjects ni fetchProjectDetail. Les deux routes passent donc sous
# require_paid_user_or_admin (admin par X-Admin-Token toujours accepte).
# ---------------------------------------------------------------------------


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
    _paid_ok: bool = Depends(require_paid_user_or_admin),
):
    query = select(Project)
    count_query = select(func.count(Project.id))

    if country:
        # Constate le 2026-10-01 : l'egalite stricte ignorait les projets
        # stockes « Cote d'Ivoire » (Banque mondiale) quand on filtrait sur
        # « Côte d'Ivoire ». Comparaison sans accents ni casse des deux cotes,
        # sans extension Postgres (translate + lower natifs, cf. app/text_fold).
        country_cond = fold_sql(Project.country) == fold_text(country)
        query = query.where(country_cond)
        count_query = count_query.where(country_cond)
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


# ---------------------------------------------------------------------------
# Appel LLM repete - constate le 2026-10-01 : « enrichir si aucun besoin en
# base » rappelait le LLM A CHAQUE ouverture pour tout projet dont
# l'enrichissement aboutit a zero besoin : projets « non machine » (textile,
# assurance, fournitures… : enrich_project vide volontairement leurs besoins),
# reponse LLM vide ou en echec. Le front rouvrait le detail toutes les 45 s :
# un appel LLM facturable toutes les 45 s par projet affiche.
# Correctif : une tentative automatique par projet est retenue 24 h ; pendant
# ce delai on sert le resultat deja enregistre (besoins, contacts, acteurs) sans
# rappeler le LLM. `force_ai=true` (bouton explicite) recalcule toujours.
# Limite connue : memoire du processus (un seul worker uvicorn, cf. Dockerfile) ;
# un redemarrage autorise une nouvelle tentative. Une colonne « enrichi le »
# demanderait une migration Alembic.
# ---------------------------------------------------------------------------
_AUTO_ENRICH_RETRY_AFTER_SEC = 24 * 3600
_AUTO_ENRICH_MAX_KEYS = 20000
_auto_enrich_attempts: dict[str, float] = {}
_last_attempt_stamp = 0.0


def _auto_enrich_recently_attempted(project_id) -> bool:
    attempted_at = _auto_enrich_attempts.get(str(project_id))
    return attempted_at is not None and (time.monotonic() - attempted_at) < _AUTO_ENRICH_RETRY_AFTER_SEC


def _next_attempt_stamp() -> float:
    """Horodatage monotone STRICTEMENT croissant : il sert aussi d'identifiant
    de la tentative (deux tentatives ne partagent jamais la même valeur, même
    si l'horloge n'a pas avancé entre les deux)."""
    global _last_attempt_stamp
    now = time.monotonic()
    _last_attempt_stamp = now if now > _last_attempt_stamp else _last_attempt_stamp + 1e-6
    return _last_attempt_stamp


def _remember_auto_enrich_attempt(project_id) -> tuple[float | None, float]:
    """Note une tentative. Renvoie (tentative précédente, cette tentative)."""
    key = str(project_id)
    # Retirer puis reinserer : l'ordre d'insertion du dict reste chronologique,
    # la plus ancienne tentative est donc toujours en tete (purge en O(1)).
    previous = _auto_enrich_attempts.pop(key, None)
    stamp = _next_attempt_stamp()
    _auto_enrich_attempts[key] = stamp
    while len(_auto_enrich_attempts) > _AUTO_ENRICH_MAX_KEYS:
        _auto_enrich_attempts.pop(next(iter(_auto_enrich_attempts)))
    return previous, stamp


def _cancel_auto_enrich_attempt(project_id, claim: tuple[float | None, float]) -> None:
    """Annule une tentative qui n'a finalement pas appelé le LLM (401/403/429).

    On ne touche à rien si une AUTRE tentative a été notée entre-temps ; sinon on
    remet la tentative précédente (ou rien), comme si celle-ci n'avait pas eu lieu.
    """
    key = str(project_id)
    previous, stamp = claim
    if _auto_enrich_attempts.get(key) != stamp:
        return
    if previous is None:
        _auto_enrich_attempts.pop(key, None)
    else:
        _auto_enrich_attempts[key] = previous


@router.get("/{project_id}", response_model=ProjectDetailOut)
async def get_project(
    project_id: UUID,
    request: Request,
    ai: bool = Query(False, description="Enrichir les besoins machines via IA"),
    force_ai: bool = Query(False, description="Forcer le recalcul IA même si des besoins existent"),
    db: AsyncSession = Depends(get_db),
    _paid_ok: bool = Depends(require_paid_user_or_admin),
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
        # une analyse déjà stockée à chaque ouverture du détail) ET si aucune
        # tentative automatique n'a eu lieu depuis 24 h (voir plus haut).
        # `force_ai=true` force un recalcul LLM (admin / bouton explicite).
        has_equipment = bool(project.equipment_needs)
        should_enrich = force_ai or (
            not has_equipment and not _auto_enrich_recently_attempted(project.id)
        )
        if should_enrich:
            # Noter la tentative AVANT tout `await` : deux ouvertures simultanees
            # du meme projet ne doivent pas declencher deux appels LLM.
            # Constate le 2026-10-01 (relecture) : la tentative etait notee APRES
            # `await _enforce_llm_entitlement`, qui fait un vrai appel reseau
            # (abonnement) quand son cache de 60 s est vide. Pendant cette
            # attente, une seconde requete passait la verification : deux appels
            # LLM facturables pour le meme projet.
            claim = _remember_auto_enrich_attempt(project.id)
            # MG-H09 : paywall + quota AVANT tout appel LLM facturable. Le quota
            # n'est plus consommé quand aucun appel LLM n'a lieu (résultat déjà
            # enregistré) : consulter des projets déjà analysés ne mène plus au 429.
            try:
                await _enforce_llm_entitlement(request, settings)
            except BaseException:
                # Refus (401/403/429) ou requete interrompue : aucun appel LLM
                # n'a eu lieu, la tentative est rendue (un 429 ne la consomme pas).
                _cancel_auto_enrich_attempt(project.id, claim)
                raise
            try:
                await enrich_project(db, project)
                # Reload updated relations after enrichment
                result = await db.execute(query)
                project = result.scalar_one_or_none() or project
            except Exception:
                # Keep endpoint resilient: fallback logic below still applies.
                pass

    detail = ProjectDetailOut.model_validate(project)
    if ai:
        # Contrat (a) — constaté le 2026-10-01 : rien ne disait au front si
        # l'analyse demandée (?ai=true) venait d'une vraie IA. Sans clé, le
        # client est simulé : enrich_project n'enregistre alors aucune réponse
        # simulée, et ce détail ne contient rien qui vienne d'une IA.
        detail.simulated = llm_is_simulated(settings)

    title_lower = (project.title or "").lower()
    is_non_machine_project = any(k in title_lower for k in _NON_MACHINE_TITLE_KEYWORDS)

    # Fallback: if no equipment_needs in DB, compute via rules engine
    # Contrat (c) — constaté le 2026-10-01 : ces besoins ESTIMÉS (règles
    # type/phase/budget, aucune lecture de l'AO) n'étaient reconnaissables que
    # par le texte « [estimated] ». Ils portent désormais estimated=true et
    # source="estimation" (texte conservé pour les clients actuels) : le front
    # ne doit jamais les croiser avec le stock du vendeur ni les compter dans un
    # score d'opportunité ou une mention « compatible ».
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
                estimated=True,
                source="estimation",
            )
            for e in estimates
            if e.qty_max > 0
        ]

    return detail


@router.get("/{project_id}/analysis-compare")
async def get_project_analysis_compare(
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _paid_ok: bool = Depends(require_paid_user_or_admin),
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
    # MG-H09 : cet endpoint appelle systematiquement le LLM -> quota obligatoire.
    await _enforce_llm_entitlement(request, get_settings())
    return await compare_project_methods(project)
