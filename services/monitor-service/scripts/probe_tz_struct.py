"""Structure des releases Tanzanie : stade, presence tender/awards/planning, ou trouver un titre."""
import asyncio
import zlib
import json
import httpx
from collections import Counter


async def main():
    url = "https://data.open-contracting.org/en/publication/152/download"
    dec = zlib.decompressobj(16 + zlib.MAX_WBITS)
    buf = ""
    n = 0
    tags = Counter()
    has = Counter()
    sample_award = None
    async with httpx.AsyncClient(timeout=120, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True) as c:
        async with c.stream("GET", url, params={"name": "2026.jsonl.gz"}) as r:
            async for chunk in r.aiter_bytes(131072):
                out = b""
                cur = chunk
                while cur:
                    out += dec.decompress(cur)
                    if dec.eof:
                        cur = dec.unused_data
                        dec = zlib.decompressobj(16 + zlib.MAX_WBITS)
                    else:
                        cur = b""
                buf += out.decode("utf-8", "replace")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    if not line.strip():
                        continue
                    try:
                        rel = json.loads(line)
                    except Exception:
                        continue
                    n += 1
                    tags["+".join(rel.get("tag") or [])] += 1
                    if rel.get("tender"):
                        has["tender"] += 1
                    if rel.get("tender", {}).get("title"):
                        has["tender.title"] += 1
                    if rel.get("awards"):
                        has["awards"] += 1
                    if rel.get("planning"):
                        has["planning"] += 1
                    if rel.get("awards") and sample_award is None:
                        sample_award = rel
                if n >= 4000:
                    break
    print("n=", n)
    print("tags:", dict(tags))
    print("has:", dict(has))
    if sample_award:
        t = sample_award.get("tender") or {}
        aw = sample_award.get("awards") or [{}]
        pl = sample_award.get("planning") or {}
        print("\n--- release AVEC awards ---")
        print("tender.title:", t.get("title"))
        print("award.title:", aw[0].get("title"))
        print("award.suppliers:", [(s.get("name")) for s in (aw[0].get("suppliers") or [])])
        print("planning keys:", list(pl.keys()))
        print("planning.project/title:", (pl.get("project") or {}).get("title") if isinstance(pl.get("project"), dict) else pl.get("rationale"))
        print("top keys:", list(sample_award.keys()))


asyncio.run(main())
