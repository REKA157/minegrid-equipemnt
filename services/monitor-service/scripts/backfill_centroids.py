"""Backfill : pose les coordonnees (centroide pays) sur les projets sans lat/lon,
pour que la carte du Global Monitor ne soit pas vide. Idempotent.

Usage (conteneur api) : python scripts/backfill_centroids.py
"""
import asyncio
import os

import asyncpg

from app.geocoder_centroids import country_centroid


async def main() -> None:
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    try:
        rows = await conn.fetch("select id, country from projects where lat is null or lon is null")
        updated = 0
        missing: dict[str, int] = {}
        for r in rows:
            c = country_centroid(r["country"])
            if not c:
                missing[r["country"] or "(vide)"] = missing.get(r["country"] or "(vide)", 0) + 1
                continue
            await conn.execute(
                "update projects set lat=$1, lon=$2 where id=$3", float(c[0]), float(c[1]), r["id"]
            )
            updated += 1
        print(f"coordonnees posees={updated} sans_centroide={sum(missing.values())}")
        if missing:
            print("pays sans centroide:", dict(sorted(missing.items(), key=lambda x: -x[1])))
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
