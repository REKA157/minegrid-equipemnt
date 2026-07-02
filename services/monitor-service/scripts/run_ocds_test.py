"""Teste le connecteur ocds_feed sur 2 flux (Ghana bulk + Afrique du Sud API) -> upsert."""
import asyncio

from app.database import AsyncSessionLocal
from app.ingestion.connectors.ocds_feed import OCDSConnector
from app.ingestion.upsert import upsert_assets

CONFIGS = [
    {
        "source_name": "Ghana PPA", "mode": "bulk_jsonl_gz", "country_default": "Ghana",
        "feed_url": "https://data.open-contracting.org/en/publication/85/download",
        "params": {"name": "full.jsonl.gz"}, "max_items": 1200,
    },
    {
        "source_name": "South Africa eTenders", "mode": "api", "country_default": "South Africa",
        "feed_url": "https://ocds-api.etenders.gov.za/api/OCDSReleases",
        "params": {"PageSize": 50, "dateFrom": "2025-01-01", "dateTo": "2026-06-29"},
        "max_items": 400, "max_pages": 15,
    },
]


async def main():
    async with AsyncSessionLocal() as db:
        for cfg in CONFIGS:
            conn = OCDSConnector(config=cfg)
            assets = await conn.fetch()
            awarded = [a for a in assets if a.phase == "awarded"]
            print(f"\n=== {cfg['source_name']} : fetched={len(assets)} awarded={len(awarded)} ===")
            for a in awarded[:5]:
                sup = (a.raw or {}).get("awarded_supplier")
                print(f"  [{a.country[:14]}] {a.title[:46]} -> {sup} | budget={a.budget_usd}")
            res = await upsert_assets(db, assets)
            print(f"  upsert: inserted={res.inserted} updated={res.updated} skipped={res.skipped} errors={res.errors}")


if __name__ == "__main__":
    asyncio.run(main())
