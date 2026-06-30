"""Diagnostique le streaming d'un bulk OCDS : headers, octets recus, decompression, lignes."""
import asyncio
import zlib
import httpx


async def diag(pid, name):
    url = f"https://data.open-contracting.org/en/publication/{pid}/download"
    dec = zlib.decompressobj(16 + zlib.MAX_WBITS)
    buf = ""
    nbytes = ndecomp = nlines = 0
    first = None
    looks_gzip = None
    async with httpx.AsyncClient(timeout=120, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True) as c:
        async with c.stream("GET", url, params={"name": name}) as r:
            print(f"\n[{pid} {name}] status={r.status_code} ctype={r.headers.get('content-type')} "
                  f"cenc={r.headers.get('content-encoding')} final_url={str(r.url)[:60]}")
            async for chunk in r.aiter_bytes(131072):
                if looks_gzip is None:
                    looks_gzip = chunk[:2] == bytes([0x1f, 0x8b])
                nbytes += len(chunk)
                try:
                    out = b""
                    cur = chunk
                    while cur:
                        out += dec.decompress(cur)
                        if dec.eof:
                            cur = dec.unused_data
                            dec = zlib.decompressobj(16 + zlib.MAX_WBITS)
                        else:
                            cur = b""
                except Exception as e:
                    print("   decompress EXC:", repr(e)[:80])
                    break
                ndecomp += len(out)
                buf += out.decode("utf-8", "replace")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    if line.strip():
                        nlines += 1
                        if first is None:
                            first = line[:160]
                if nlines > 50:
                    break
    print(f"   nbytes={nbytes} chunk_is_gzip={looks_gzip} ndecomp={ndecomp} nlines={nlines}")
    print(f"   first_line={first}")


async def main():
    await diag("152", "2026.jsonl.gz")
    await diag("85", "full.jsonl.gz")  # Ghana (temoin qui marche)


asyncio.run(main())
