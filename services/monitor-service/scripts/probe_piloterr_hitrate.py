"""Jetable : mesure le taux de reussite de Piloterr Google Maps sur de vrais laureats."""
import os
import asyncio
import asyncpg
import httpx


async def main():
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    k = os.environ["PILOTERR_API_KEY"]
    conn = await asyncpg.connect(url)
    rows = await conn.fetch(
        """select c.organization, p.country from project_contacts c
           join projects p on p.id=c.project_id
           where c.role='winner' and coalesce(p.country,'')<>''
           order by random() limit 12"""
    )
    await conn.close()
    hits = 0
    for r in rows:
        org, country = r["organization"], r["country"]
        q = f"{org} {country}"
        try:
            resp = httpx.get("https://api.piloterr.com/v2/google/maps",
                             params={"query": q}, headers={"x-api-key": k}, timeout=40)
            data = resp.json()
            top = data[0] if isinstance(data, list) and data else None
            phone = top.get("phone_number") if top else None
            web = top.get("website") if top else None
            if phone or web:
                hits += 1
            print(f"{(org or '')[:26]:26} | {country[:14]:14} | phone={phone} | web={(web or '')[:34]}")
        except Exception as e:
            print((org or "")[:26], "ERR", repr(e)[:80])
    print(f"\nHIT (phone OU site) : {hits}/{len(rows)}")


asyncio.run(main())
