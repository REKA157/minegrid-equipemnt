"""Backfill : pose le budget reel (montant signe du contrat, converti en USD) sur les
projets World Bank attribues deja en base. Ne touche QUE budget_usd (pas les contacts).

Usage (conteneur api) : python scripts/backfill_wb_budget.py
"""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Project
from app.ingestion.connectors.wb_procurement import _extract_award, _strip_html, value_to_usd


async def main() -> None:
    updated = 0
    async with AsyncSessionLocal() as db:
        projects = (await db.execute(select(Project))).scalars().all()
        for p in projects:
            if p.source != "World Bank Procurement":
                continue
            raw = p.raw or {}
            value = raw.get("awarded_value")
            if not value and raw.get("notice_text"):
                _, _, value = _extract_award(_strip_html(raw["notice_text"]))
            usd = value_to_usd(value)
            if usd and (p.budget_usd is None or p.budget_usd == 0):
                p.budget_usd = usd
                updated += 1
        await db.commit()
    print(f"budgets poses (montant contrat -> USD) = {updated}")


if __name__ == "__main__":
    asyncio.run(main())
