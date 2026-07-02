"""Dedup + upsert logic shared by all connectors, with geocoding enrichment."""
from __future__ import annotations
import logging
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, ProjectContact
from app.ingestion.asset import ProjectAsset
from app.ingestion.fingerprint import compute_fingerprint
from app.ingestion.relevance import is_equipment_relevant
from app.schemas import IngestResult
from app.geocoder import enrich_coordinates

logger = logging.getLogger("monitor.upsert")


def _clip(v, n: int):
    return v.strip()[:n] if isinstance(v, str) and v.strip() else None


def materialize_contacts(project: Project, raw: dict) -> None:
    """Materialise les contacts STRUCTURES portes par certains connecteurs (World Bank) :
    LAUREAT (awarded_supplier -> role 'winner') et MAITRE D'OUVRAGE (contact_organization
    -> role 'buyer'). Rend le marche directement actionnable comme prospect, sans LLM.
    Utilise la relation ORM : project_id est pose automatiquement au flush."""
    if not isinstance(raw, dict):
        return
    supplier = _clip(raw.get("awarded_supplier"), 300)
    if supplier:
        value = _clip(raw.get("awarded_value"), 60)
        note = "Attributaire (avis d'attribution World Bank)"
        if value:
            note += f" — montant signe {value}"
        project.contacts.append(ProjectContact(
            organization=supplier, role="winner", confidence=Decimal("0.80"),
            address=_clip(raw.get("awarded_supplier_address"), 1000), rationale=note,
        ))
    org = _clip(raw.get("contact_organization"), 300)
    if org:
        project.contacts.append(ProjectContact(
            organization=org, person_name=_clip(raw.get("contact_name"), 200),
            email=_clip(raw.get("contact_email"), 255), phone=_clip(raw.get("contact_phone"), 80),
            role="buyer", confidence=Decimal("0.70"),
            rationale="Maitre d'ouvrage (avis World Bank)",
        ))


async def upsert_assets(
    db: AsyncSession,
    assets: list[ProjectAsset],
    result: IngestResult | None = None,
) -> IngestResult:
    if result is None:
        result = IngestResult()

    for asset in assets:
        # Filtre PERTINENCE : ne garder que les AO susceptibles de necessiter des engins
        # (materiel minier / BTP / travaux). Exclut informatique, services, bruit de scraping.
        if not is_equipment_relevant(asset.title, asset.raw):
            result.skipped += 1
            logger.debug("Skipped (hors-scope engins): %s", asset.title)
            continue

        fp = compute_fingerprint(
            asset.title,
            asset.country,
            asset.source,
            asset.source_url,
            asset.region,
            asset.phase,
        )
        try:
            # Geocode if lat/lon missing
            lat, lon = await enrich_coordinates(
                db,
                title=asset.title,
                region=asset.region,
                country=asset.country,
                existing_lat=asset.lat,
                existing_lon=asset.lon,
            )
            asset.lat = lat
            asset.lon = lon

            existing = (
                await db.execute(select(Project).where(Project.fingerprint == fp))
            ).scalar_one_or_none()

            data = asset.to_dict()
            data["fingerprint"] = fp

            if existing:
                # Keep a simple trace of merged origins in raw.sources.
                existing_raw = existing.raw or {}
                existing_sources = existing_raw.get("sources", [])
                source_entry = {
                    "source": asset.source,
                    "source_url": asset.source_url,
                    "phase": asset.phase,
                    "country": asset.country,
                }
                if source_entry not in existing_sources:
                    existing_sources.append(source_entry)

                for key, val in data.items():
                    if key != "fingerprint" and val is not None:
                        setattr(existing, key, val)
                # Preserve max confidence when multiple sources overlap.
                if existing.confidence is not None and asset.confidence is not None:
                    existing.confidence = max(existing.confidence, asset.confidence)
                existing.raw = {**existing_raw, **(asset.raw or {}), "sources": existing_sources}
                result.updated += 1
                logger.debug("Updated: %s", asset.title)
            else:
                raw = asset.raw or {}
                if "sources" not in raw:
                    raw["sources"] = [{
                        "source": asset.source,
                        "source_url": asset.source_url,
                        "phase": asset.phase,
                        "country": asset.country,
                    }]
                data["raw"] = raw
                project = Project(**data)
                db.add(project)
                materialize_contacts(project, raw)
                result.inserted += 1
                logger.debug("Inserted: %s", asset.title)

        except Exception as exc:
            result.errors += 1
            msg = f"Error on '{asset.title}': {exc}"
            result.details.append(msg)
            logger.warning(msg)

    await db.commit()
    return result
