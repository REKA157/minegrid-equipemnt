"""Sonde 2 flux OCDS representatifs (API live + bulk jsonl.gz) pour caler le parser. Jetable."""
import gzip
import json
import httpx

UA = {"User-Agent": "Mozilla/5.0 (MinegridMonitor/1.0)"}


def show_release(prefix, rel):
    print(f"{prefix} release keys:", list(rel.keys())[:14])
    print(f"{prefix} tender.title:", (rel.get("tender") or {}).get("title"))
    print(f"{prefix} tender.value:", (rel.get("tender") or {}).get("value"))
    buyer = rel.get("buyer") or {}
    print(f"{prefix} buyer:", buyer.get("name"), "| pays:", ((buyer.get("address") or {}).get("countryName")))
    aw = rel.get("awards") or []
    print(f"{prefix} awards:", len(aw))
    for a in aw[:2]:
        sup = (a.get("suppliers") or [{}])
        print(f"{prefix}   -> gagnant:", sup[0].get("name"), "| value:", a.get("value"), "| status:", a.get("status"))


print("=== 1) AFRIQUE DU SUD — API OCDS live ===")
try:
    r = httpx.get("https://ocds-api.etenders.gov.za/api/OCDSReleases",
                  params={"PageNumber": 1, "PageSize": 5, "dateFrom": "2025-06-01", "dateTo": "2026-06-29"},
                  timeout=45, headers=UA)
    print("status", r.status_code, "len", len(r.text))
    d = r.json()
    print("top keys:", list(d.keys()))
    rels = d.get("releases") or []
    print("releases:", len(rels), "| links:", d.get("links"))
    if rels:
        show_release("SA", rels[0])
except Exception as e:
    print("SA ERR", repr(e)[:200])

print("\n=== 2) GHANA — bulk OCDS jsonl.gz (registre OCP) ===")
try:
    r = httpx.get("https://data.open-contracting.org/en/publication/85/download",
                  params={"name": "full.jsonl.gz"}, timeout=120, headers=UA, follow_redirects=True)
    print("status", r.status_code, "bytes", len(r.content))
    raw = gzip.decompress(r.content)
    lines = [l for l in raw.split(b"\n") if l.strip()]
    print("lignes:", len(lines))
    obj = json.loads(lines[0])
    print("ligne0 keys:", list(obj.keys())[:8])
    if "releases" in obj:
        show_release("GH", obj["releases"][0])
    elif "records" in obj:
        show_release("GH", obj["records"][0].get("compiledRelease", {}))
    else:
        show_release("GH", obj)
except Exception as e:
    print("GH ERR", repr(e)[:200])
