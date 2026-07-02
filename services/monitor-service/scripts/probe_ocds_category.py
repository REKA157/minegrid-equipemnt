"""Confirme la categorie structuree OCDS (works/goods/services + CPV) — Pays-Bas, en streaming."""
import zlib
import json
from collections import Counter
import httpx

UA = {"User-Agent": "Mozilla/5.0"}
url = "https://data.open-contracting.org/en/publication/71/download"
dec = zlib.decompressobj(16 + zlib.MAX_WBITS)
buf = ""
cats = Counter()
cpv2 = Counter()
shown = n = 0
with httpx.stream("GET", url, params={"name": "full.jsonl.gz"}, timeout=120, headers=UA, follow_redirects=True) as r:
    print("status", r.status_code)
    for chunk in r.iter_bytes(131072):
        buf += dec.decompress(chunk).decode("utf-8", "replace")
        while "\n" in buf and n < 300:
            line, buf = buf.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            try:
                rel = json.loads(line)
            except Exception:
                continue
            if "releases" in rel:
                rel = rel["releases"][0]
            t = rel.get("tender") or {}
            cat = t.get("mainProcurementCategory") or "?"
            cats[cat] += 1
            cpv = str((t.get("classification") or {}).get("id") or "")
            cpv2[cpv[:2]] += 1
            aw = rel.get("awards") or []
            sup = ((aw[0].get("suppliers") or [{}])[0].get("name")) if aw else None
            if shown < 14:
                print(f"  cat={cat:9} cpv={cpv[:8]:8} | {(t.get('title') or '')[:40]:40} | win={sup}")
                shown += 1
            n += 1
        if n >= 300:
            break
print("\nmainProcurementCategory:", dict(cats))
print("CPV (2 chiffres):", dict(cpv2.most_common(12)))
