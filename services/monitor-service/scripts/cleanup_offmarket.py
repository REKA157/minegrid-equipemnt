"""Maintenance : supprime les projets HORS-MARCHE (pays hors Afrique/Maghreb/MO/Europe),
selon target_markets.py. Cascade FK -> enfants.

    python scripts/cleanup_offmarket.py            # compte (dry-run)
    python scripts/cleanup_offmarket.py --apply    # supprime
"""
import asyncio
import os
import sys

import asyncpg

from app.ingestion.target_markets import is_target_country


async def main(apply: bool) -> None:
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    try:
        rows = await conn.fetch("select id, country from projects where coalesce(country,'') <> ''")
        offmarket = [r["id"] for r in rows if not is_target_country(r["country"])]
        print(f"avec_pays={len(rows)} hors_marche={len(offmarket)} cibles={len(rows) - len(offmarket)}")
        if apply and offmarket:
            await conn.execute("delete from projects where id = any($1::uuid[])", offmarket)
            print(f"supprimes={len(offmarket)} (+ enfants via cascade)")
        elif offmarket:
            print("DRY-RUN : rien supprime. Relancer avec --apply.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
