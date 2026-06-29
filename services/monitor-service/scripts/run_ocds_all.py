"""Exécute tous les flux ocds_feed activés de sources.yaml -> upsert, rapport par source."""
import asyncio

from app.database import AsyncSessionLocal
from app.ingestion.registry import load_sources, CONNECTOR_MAP
from app.ingestion.upsert import upsert_assets


async def main():
    sources = [s for s in load_sources() if s.get("connector") == "ocds_feed" and s.get("enabled", True)]
    print(f"{len(sources)} sources OCDS")
    async with AsyncSessionLocal() as db:
        for src in sources:
            conn = CONNECTOR_MAP["ocds_feed"](config=src.get("config", {}))
            try:
                assets = await conn.fetch()
                aw = sum(1 for a in assets if a.phase == "awarded")
                res = await upsert_assets(db, assets)
                print(f"{src['name'][:42]:42} fetched={len(assets):5} awarded={aw:5} inserted={res.inserted:4} skipped={res.skipped:5}")
            except Exception as e:
                print(f"{src['name'][:42]:42} ERREUR {repr(e)[:90]}")


if __name__ == "__main__":
    asyncio.run(main())
