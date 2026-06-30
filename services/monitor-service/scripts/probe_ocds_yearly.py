"""Teste le connecteur ocds_feed sur les fichiers ANNUELS des gros gisements
(Tanzanie/Italie/France) pour voir lesquels parsent correctement."""
import asyncio
from app.ingestion.connectors.ocds_feed import OCDSConnector

CASES = [
    ("Tanzanie 2026", "152", "2026.jsonl.gz", "Tanzania"),
    ("Italie 2025", "117", "2025.jsonl.gz", "Italy"),
    ("France full", "23", "full.jsonl.gz", "France"),
    ("France 2024", "23", "2024.jsonl.gz", "France"),
]


async def main():
    for label, pid, name, country in CASES:
        cfg = {
            "source_name": label, "mode": "bulk_jsonl_gz", "country_default": country,
            "max_items": 200, "restrict_to_target_markets": False,
            "feed_url": f"https://data.open-contracting.org/en/publication/{pid}/download",
            "params": {"name": name},
        }
        try:
            c = OCDSConnector(config=cfg)
            assets = await c.fetch()
            aw = [a for a in assets if a.phase == "awarded"]
            print(f"\n=== {label} : fetched={len(assets)} awarded={len(aw)} ===")
            for a in (aw or assets)[:3]:
                sup = (a.raw or {}).get("awarded_supplier")
                cat = (a.raw or {}).get("procurement_category")
                print(f"   [{cat}] {a.title[:46]} -> {sup} | {a.budget_usd}")
        except Exception as e:
            print(f"\n=== {label} : ERREUR {repr(e)[:120]}")


asyncio.run(main())
