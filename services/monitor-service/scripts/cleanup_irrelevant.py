"""Maintenance : supprime de la base les projets HORS-SCOPE engins (informatique,
services, bruit de scraping), selon EXACTEMENT le filtre d'ingestion (relevance.py).

Usage (dans le conteneur api) :
    python scripts/cleanup_irrelevant.py            # compte seulement (dry-run)
    python scripts/cleanup_irrelevant.py --apply    # supprime (cascade -> enfants)

Les FK projets->{documents,entities,contacts,equipment_needs} sont ON DELETE CASCADE :
supprimer un projet supprime ses enfants automatiquement.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

import asyncpg

from app.ingestion.relevance import is_equipment_relevant


def _to_dict(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            v = json.loads(raw)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}
    return {}


async def main(apply: bool) -> None:
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    try:
        rows = await conn.fetch("select id, title, raw from projects")
        irrelevant = [r["id"] for r in rows if not is_equipment_relevant(r["title"], _to_dict(r["raw"]))]
        print(f"total={len(rows)} hors_scope={len(irrelevant)} pertinents={len(rows) - len(irrelevant)}")
        if not apply:
            rej = [r["title"] for r in rows if not is_equipment_relevant(r["title"], _to_dict(r["raw"]))]
            kept = [r["title"] for r in rows if is_equipment_relevant(r["title"], _to_dict(r["raw"]))]
            print("=== REJETES (15) ===")
            for t in rej[:15]:
                print(" -", (t or "")[:90])
            print("=== GARDES (15) ===")
            for t in kept[:15]:
                print(" -", (t or "")[:90])
        if apply and irrelevant:
            await conn.execute("delete from projects where id = any($1::uuid[])", irrelevant)
            print(f"supprimes={len(irrelevant)} (+ enfants via cascade)")
        elif irrelevant:
            print("DRY-RUN : rien supprime. Relancer avec --apply pour appliquer.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
