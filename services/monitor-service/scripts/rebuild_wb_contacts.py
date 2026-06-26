"""Reconstruit proprement les contacts des projets World Bank deja en base :
 - efface les contacts existants (dont les « [EXTRACT] » bogues : faux telephone = ID WB) ;
 - recree le LAUREAT (avec ADRESSE + montant, re-parses depuis notice_text) et le MAITRE D'OUVRAGE.

Usage (conteneur api) : python scripts/rebuild_wb_contacts.py
"""
import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Project, ProjectContact
from app.ingestion.connectors.wb_procurement import _extract_award, _strip_html


def _clip(v, n):
    return v.strip()[:n] if isinstance(v, str) and v.strip() else None


async def main() -> None:
    winners = buyers = wiped = 0
    async with AsyncSessionLocal() as db:
        projects = (await db.execute(select(Project))).scalars().all()
        for p in projects:
            if p.source != "World Bank Procurement":
                continue
            raw = p.raw or {}
            supplier = raw.get("awarded_supplier")
            address = raw.get("awarded_supplier_address")
            value = raw.get("awarded_value")
            notice = raw.get("notice_text")
            if notice and (not address or not value):
                nm, addr, val = _extract_award(_strip_html(notice))
                supplier = supplier or nm
                address = address or addr
                value = value or val
            org = raw.get("contact_organization")

            existing = (
                await db.execute(select(ProjectContact).where(ProjectContact.project_id == p.id))
            ).scalars().all()
            for c in existing:
                await db.delete(c)
                wiped += 1

            if _clip(supplier, 300):
                note = "Attributaire (avis d'attribution World Bank)"
                if _clip(value, 60):
                    note += f" — montant signe {value}"
                db.add(ProjectContact(
                    project_id=p.id, organization=_clip(supplier, 300), role="winner",
                    address=_clip(address, 1000), confidence=Decimal("0.80"), rationale=note,
                ))
                winners += 1
            if _clip(org, 300):
                db.add(ProjectContact(
                    project_id=p.id, organization=_clip(org, 300),
                    person_name=_clip(raw.get("contact_name"), 200), email=_clip(raw.get("contact_email"), 255),
                    phone=_clip(raw.get("contact_phone"), 80), role="buyer",
                    confidence=Decimal("0.70"), rationale="Maitre d'ouvrage (avis World Bank)",
                ))
                buyers += 1
        await db.commit()
    print(f"contacts effaces={wiped} -> recrees: laureat={winners} maitre_ouvrage={buyers}")


if __name__ == "__main__":
    asyncio.run(main())
