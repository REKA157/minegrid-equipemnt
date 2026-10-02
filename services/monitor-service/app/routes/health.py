import os

from fastapi import APIRouter
from app.schemas import HealthOut

router = APIRouter(tags=["health"])

_UNKNOWN = "inconnue"


def _build_value(name: str) -> str:
    """Valeur posée au build Docker (ENV), « inconnue » si absente ou vide."""
    value = (os.environ.get(name) or "").strip()
    return value or _UNKNOWN


@router.get("/health", response_model=HealthOut)
async def health():
    # Schéma historique conservé (status, version, service) : seuls deux champs
    # sont AJOUTÉS, aucun client existant ne casse.
    return HealthOut(
        build_sha=_build_value("BUILD_SHA"),
        build_date=_build_value("BUILD_DATE"),
    )
