"""Backfill : cree les contacts laureat/maitre d'ouvrage pour les projets World Bank
deja en base (inseres avant la materialisation a l'upsert). Idempotent (ne duplique pas).

Usage (conteneur api) : python scripts/backfill_wb_contacts.py
"""
import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Project, ProjectContact


def _clip(v, n):
    return v.strip()[:n] if isinstance(v, str) and v.strip() else None


async def main() -> None:
    created_w = created_b = 0
    async with AsyncSessionLocal() as db:
        projects = (await db.execute(select(Project))).scalars().all()
        for p in projects:
            raw = p.raw or {}
            supplier = _clip(raw.get("awarded_supplier"), 300)
            org = _clip(raw.get("contact_organization"), 300)
            if not (supplier or org):
                continue
            existing = (
                await db.execute(select(ProjectContact).where(ProjectContact.project_id == p.id))
            ).scalars().all()
            roles = {c.role for c in existing}
            if supplier and "winner" not in roles:
                db.add(ProjectContact(
                    project_id=p.id, organization=supplier, role="winner",
                    confidence=Decimal("0.80"), rationale="Attributaire (avis d'attribution World Bank)",
                ))
                created_w += 1
            if org and "buyer" not in roles:
                db.add(ProjectContact(
                    project_id=p.id, organization=org, person_name=_clip(raw.get("contact_name"), 200),
                    email=_clip(raw.get("contact_email"), 255), phone=_clip(raw.get("contact_phone"), 80),
                    role="buyer", confidence=Decimal("0.70"), rationale="Maitre d'ouvrage (avis World Bank)",
                ))
                created_b += 1
        await db.commit()
    print(f"contacts crees -> winner={created_w} buyer={created_b}")


if __name__ == "__main__":
    asyncio.run(main())
