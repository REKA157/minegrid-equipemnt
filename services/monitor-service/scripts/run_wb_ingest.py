"""Lance UNIQUEMENT le connecteur World Bank Procurement -> filtre -> upsert.
Usage : python scripts/run_wb_ingest.py [max_items]"""
import asyncio
import sys

from app.database import AsyncSessionLocal
from app.ingestion.connectors.wb_procurement import WBProcurementConnector
from app.ingestion.upsert import upsert_assets


async def main(max_items: int) -> None:
    conn = WBProcurementConnector(config={
        "max_items": max_items,
        "page_rows": 200,
        "exclude_groups": ["CS"],
        "country_names": [],
    })
    assets = await conn.fetch()
    awards = sum(1 for a in assets if a.phase == "awarded")
    print(f"fetched={len(assets)} (dont awarded={awards}, tender={len(assets) - awards})")
    async with AsyncSessionLocal() as db:
        res = await upsert_assets(db, assets)
    print(f"inserted={res.inserted} updated={res.updated} skipped={res.skipped} errors={res.errors}")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    asyncio.run(main(n))
