"""Enrichit les contacts LAUREAT (sans tel/email) via recherche web (Piloterr Google
Search), avec garde-fou de correspondance de nom. Idempotent, plafonne, rate-limite.

Usage (conteneur api) :
    python scripts/enrich_winner_contacts.py [limit] [pays]
    ex: python scripts/enrich_winner_contacts.py 30 Morocco
"""
import asyncio
import os
import re
import sys
from decimal import Decimal

import httpx
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Project, ProjectContact
from app.ingestion.company_contacts import find_company_contact, _norm


def _city_hint(address: str | None, country: str | None) -> str | None:
    """Heuristique : le dernier mot 'lieu' de l'adresse (souvent la ville), hors pays."""
    if not address:
        return None
    a = re.sub(re.escape(country or ""), "", address, flags=re.I)
    words = re.findall(r"[A-Za-zÀ-ÿ]{3,}", a)
    skip = {"zone", "industrielle", "rue", "avenue", "lot", "quartier", "nouvelle", "est", "ouest"}
    words = [w for w in words if w.lower() not in skip]
    return words[-1] if words else None


async def main(limit: int, only_country: str | None) -> None:
    k = os.environ.get("PILOTERR_API_KEY")
    if not k:
        print("PILOTERR_API_KEY absent dans l'environnement — abandon (rien fait).")
        return
    tried = filled = 0
    async with AsyncSessionLocal() as db, httpx.AsyncClient(timeout=55) as client:
        rows = (
            await db.execute(
                select(ProjectContact, Project)
                .join(Project, Project.id == ProjectContact.project_id)
                .where(ProjectContact.role == "winner")
            )
        ).all()
        for contact, project in rows:
            if contact.phone or contact.email or contact.website:
                continue  # deja enrichi (ou deja tente)
            if only_country and _norm(project.country) != _norm(only_country):
                continue
            if tried >= limit:
                break
            tried += 1
            city = _city_hint(contact.address, project.country)
            res = await find_company_contact(client, k, contact.organization, project.country, city)
            if res and (res.get("phone") or res.get("email") or res.get("website")):
                if res.get("phone"):
                    contact.phone = res["phone"][:80]
                if res.get("email"):
                    contact.email = res["email"][:255]
                if res.get("website"):
                    contact.website = res["website"][:500]
                contact.confidence = Decimal(str(res["confidence"]))
                base = (contact.rationale or "").split(" | ")[0]
                contact.rationale = f"{base} | {res['rationale']}"
                filled += 1
                print(f"OK  {(contact.organization or '')[:26]:26} -> tel={contact.phone} mail={contact.email} site={contact.website}")
            else:
                print(f"--  {(contact.organization or '')[:26]:26} (rien de fiable trouve)")
            await asyncio.sleep(0.3)
        await db.commit()
    print(f"\nessayes={tried} enrichis={filled}")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    pays = sys.argv[2] if len(sys.argv) > 2 else None
    asyncio.run(main(lim, pays))
