"""Nettoie les projets OCDS hors-scope (services / non-works) en re-evaluant chaque flux
avec le filtre categorie-conscient. PRESERVE les travaux + leurs gagnants enrichis.

    python scripts/cleanup_ocds_by_category.py            # compte (dry-run)
    python scripts/cleanup_ocds_by_category.py --apply    # supprime
"""
import asyncio
import os
import sys

import asyncpg

from app.ingestion.registry import load_sources, CONNECTOR_MAP
from app.ingestion.relevance import is_equipment_relevant


async def main(apply: bool) -> None:
    sources = [s for s in load_sources() if s.get("connector") == "ocds_feed" and s.get("enabled", True)]
    keep: set[str] = set()
    seen: set[str] = set()
    for src in sources:
        conn = CONNECTOR_MAP["ocds_feed"](config=src.get("config", {}))
        try:
            assets = await conn.fetch()
        except Exception as e:
            print(f"  {src['name'][:34]:34} FETCH ERR {repr(e)[:70]}")
            continue
        kept = 0
        for a in assets:
            ocid = a.source_url
            if not ocid:
                continue
            seen.add(ocid)
            if is_equipment_relevant(a.title, a.raw):
                keep.add(ocid)
                kept += 1
        print(f"  {src['name'][:34]:34} fetched={len(assets):5} works/pertinents={kept:5}")

    drop = list(seen - keep)
    print(f"\nseen={len(seen)} keep={len(keep)} a_supprimer={len(drop)}")
    if not apply:
        print("DRY-RUN : rien supprime. Relancer avec --apply.")
        return
    if drop:
        url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
        c = await asyncpg.connect(url)
        try:
            await c.execute(
                "delete from projects where source like 'OCDS%' and source_url = any($1::text[])", drop
            )
            print(f"supprimes={len(drop)} projets OCDS hors-scope (+ enfants via cascade)")
        finally:
            await c.close()


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
