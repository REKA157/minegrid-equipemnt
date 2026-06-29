"""Diagnostique les gros bulks OCDS (pourquoi fetch=0) + teste les fichiers annuels."""
import asyncio
import logging
import gzip
import httpx

logging.basicConfig(level=logging.INFO)
UA = {"User-Agent": "Mozilla/5.0"}


async def diag_connector():
    from app.ingestion.connectors.ocds_feed import OCDSConnector
    cfg = {
        "source_name": "TZ-diag", "mode": "bulk_jsonl_gz", "country_default": "Tanzania",
        "max_items": 30, "restrict_to_target_markets": False,
        "feed_url": "https://data.open-contracting.org/en/publication/152/download",
        "params": {"name": "full.jsonl.gz"},
    }
    c = OCDSConnector(config=cfg)
    try:
        a = await c.fetch()
        print("CONNECTEUR Tanzanie full -> fetched =", len(a))
    except Exception as e:
        print("CONNECTEUR EXC:", repr(e)[:200])


def probe_names():
    base = "https://data.open-contracting.org/en/publication"
    for pid in (152, 23, 117):
        for name in ("2026.jsonl.gz", "2025.jsonl.gz"):
            try:
                r = httpx.get(f"{base}/{pid}/download", params={"name": name}, timeout=60,
                              headers=UA, follow_redirects=True)
                ok_gz = r.content[:2] == bytes([0x1f, 0x8b])
                first_keys = None
                if ok_gz and r.content:
                    try:
                        line0 = gzip.decompress(r.content).split(b"\n", 1)[0]
                        import json
                        o = json.loads(line0)
                        first_keys = list(o.keys())[:6]
                    except Exception as e:
                        first_keys = f"decode-err {repr(e)[:50]}"
                print(f"pub {pid} {name}: status={r.status_code} bytes={len(r.content)} gzip={ok_gz} line0={first_keys}")
            except Exception as e:
                print(f"pub {pid} {name}: ERR {repr(e)[:70]}")


async def main():
    await diag_connector()
    print("---")
    probe_names()


asyncio.run(main())
