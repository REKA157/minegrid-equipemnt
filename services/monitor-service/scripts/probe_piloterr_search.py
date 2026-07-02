"""Jetable : mesure phone+email via Piloterr Google Search sur de vrais laureats."""
import os
import re
import asyncio
import json
import asyncpg
import httpx

EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?){3,6}\d{2,4}")
_BAD_MAIL = (".png", ".jpg", ".jpeg", ".gif", "sentry", "wixpress", "example.")


def _emails(blob):
    return [e for e in EMAIL.findall(blob) if not any(b in e.lower() for b in _BAD_MAIL)]


async def main():
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    k = os.environ["PILOTERR_API_KEY"]
    conn = await asyncpg.connect(url)
    rows = await conn.fetch(
        """select c.organization, p.country from project_contacts c
           join projects p on p.id=c.project_id
           where c.role='winner' and coalesce(p.country,'')<>''
           order by random() limit 10"""
    )
    await conn.close()
    hp = he = both = 0
    for i, r in enumerate(rows):
        org, country = r["organization"], r["country"]
        q = f"{org} {country} contact email telephone"
        try:
            resp = httpx.get("https://api.piloterr.com/v2/google/search",
                             params={"query": q}, headers={"x-api-key": k}, timeout=55)
            d = resp.json()
            if i == 0:
                print("STRUCT keys:", list(d.keys()))
            kg = d.get("knowledge_graph") or {}
            attrs = kg.get("attributes") or {}
            phone = attrs.get("Phone")
            orgs = d.get("organic_results") or []
            blob = " ".join((o.get("snippet", "") + " " + o.get("title", "")) for o in orgs[:6])
            if not phone:
                pm = PHONE.search(blob)
                phone = pm.group(0).strip() if pm and len(re.sub(r"\D", "", pm.group(0))) >= 8 else None
            emails = _emails(blob)
            website = (orgs[0].get("domain") if orgs else None)
            if phone:
                hp += 1
            if emails:
                he += 1
            if phone and emails:
                both += 1
            print(f"{(org or '')[:22]:22}|{country[:12]:12}| phone={phone} | email={emails[:1]} | web={website}")
        except Exception as e:
            print((org or "")[:22], "ERR", repr(e)[:90])
    n = len(rows)
    print(f"\nphone={hp}/{n}  email={he}/{n}  (phone OU email)={hp + he - both}/{n}")


asyncio.run(main())
