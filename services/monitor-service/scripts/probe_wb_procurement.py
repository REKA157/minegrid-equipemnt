"""Sonde : texte complet d'avis d'ATTRIBUTION (pour trouver le fournisseur/laureat)."""
import re
import httpx

BASE = "https://search.worldbank.org/api/v2/procnotices"
r = httpx.get(f"{BASE}?format=json&rows=300", timeout=60, headers={"User-Agent": "Mozilla/5.0"})
rows = r.json().get("procnotices", [])

awards = [x for x in rows if (x.get("notice_type") or "").lower() == "contract award"]
print("awards trouves:", len(awards))


def strip_html(h):
    h = re.sub(r"<[^>]+>", " ", h or "")
    return re.sub(r"\s+", " ", h).strip()


for x in awards[:2]:
    print("=" * 70)
    print("pays:", x.get("project_ctry_name"), "| grp:", x.get("procurement_group"))
    print("objet:", (x.get("bid_description") or "")[:120])
    print("--- notice_text (texte) ---")
    print(strip_html(x.get("notice_text"))[:900])
