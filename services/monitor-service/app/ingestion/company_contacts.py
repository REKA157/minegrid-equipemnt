"""Enrichissement BEST-EFFORT des coordonnees d'une entreprise laureate via
Piloterr Google Search (cle PILOTERR_API_KEY deja possedee, comme Mascus).

L'avis World Bank donne nom + ville + pays, mais pas email/telephone. On les cherche,
MAIS on n'accepte un resultat que s'il CORRESPOND au nom de l'entreprise (garde-fou
anti-faux-positif) : sinon on prefere ne rien remplir (anti-facade). Tout ce qui est
rempli est marque « a verifier » (confiance modeste) — le commercial controle avant d'appeler.
"""
from __future__ import annotations

import re
import unicodedata

import httpx

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[a-z]{2,12}\b")
_BAD_MAIL = (".png", ".jpg", ".jpeg", ".gif", ".webp", "sentry", "wixpress", "example.", "@2x", "godaddy")
# Domaines NON-entreprise (annuaires, ONG, gouv, agregateurs) -> jamais retenus.
_BAD_DOMAINS = (
    "gov", "aiddata", "wikipedia", "facebook", "linkedin", "instagram", "twitter", "youtube",
    "adamsmith", "devex", "worldbank", "opencorporates", "volza", "zoominfo", "dnb.",
    "bloomberg", "crunchbase", "iucn", "un.org", "undp", "reliefweb", "ec.europa", "trade.",
    "panjiva", "importgenius", "tofler", "glassdoor", "indeed", "ethiopianconstruction.com",
)


def _bad_domain(dom: str) -> bool:
    d = (dom or "").lower()
    return any(b in d for b in _BAD_DOMAINS)
# Mots generiques a NE PAS utiliser comme jeton distinctif de nom.
_GENERIC = {
    "entreprise", "entreprises", "ets", "sarl", "sarlu", "sas", "ste", "societe",
    "ltd", "limited", "llc", "company", "construction", "constructions", "travaux",
    "general", "generale", "group", "groupe", "global", "resources", "resourses",
    "services", "service", "engineering", "enterprise", "enterprises", "works", "work",
    "international", "africa", "afrique", "national", "gold", "tech", "technologies",
    "traders", "trader", "trading", "trade", "trades", "supply", "supplies", "supplier",
    "business", "solutions", "solution", "furniture", "motor", "motors", "water", "wells",
    "foodstuff", "foodstuffs", "agro", "multi", "spaces", "space", "systems", "system",
    "holding", "holdings", "invest", "investment", "investments", "contractor",
    "contractors", "contracting", "import", "export", "imports", "exports", "member",
    "compagny", "compagnie", "develop", "development", "industries", "industrie",
}
# Pays (normalise) -> prefixes telephoniques internationaux acceptables.
_DIAL = {
    "morocco": ("212",), "tunisia": ("216",), "algeria": ("213",), "egypt": ("20",),
    "egypt, arab republic of": ("20",), "mauritania": ("222",), "libya": ("218",),
    "senegal": ("221",), "cote d'ivoire": ("225",), "nigeria": ("234",), "cameroon": ("237",),
    "niger": ("227",), "burkina faso": ("226",), "mali": ("223",), "guinea": ("224",),
    "benin": ("229",), "ghana": ("233",), "togo": ("228",), "liberia": ("231",),
    "sierra leone": ("232",), "gambia, the": ("220",), "central african republic": ("236",),
    "congo, democratic republic of": ("243",), "chad": ("235",), "gabon": ("241",),
    "ethiopia": ("251",), "kenya": ("254",), "tanzania": ("255",), "uganda": ("256",),
    "rwanda": ("250",), "burundi": ("257",), "madagascar": ("261",), "malawi": ("265",),
    "zambia": ("260",), "mozambique": ("258",), "angola": ("244",), "somalia, federal republic of": ("252",),
    "south sudan": ("211",), "lesotho": ("266",), "mauritius": ("230",), "comoros": ("269",),
    "italy": ("39",), "ukraine": ("380",), "turkiye": ("90",), "georgia": ("995",),
    "lebanon": ("961",), "iraq": ("964",), "jordan": ("962",),
}


def _norm(s: str | None) -> str:
    s = (s or "").lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _tokens(name: str | None) -> list[str]:
    # Jetons DISTINCTIFS (>=4 lettres, hors liste generique etendue) : garde les noms
    # courts valides (LAKI, ETRAC...) tout en rejetant les mots banals (work, business...).
    return [t for t in _norm(name).split() if len(t) >= 4 and t not in _GENERIC]


def _name_match(text: str | None, tokens: list[str]) -> bool:
    flat = _norm(text).replace(" ", "")
    return any(t.replace(" ", "") in flat for t in tokens)


def _phone_ok(phone: str, country: str | None) -> bool:
    codes = _DIAL.get(_norm(country))
    raw = phone.strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith(("+", "00")):
        if not codes:
            return True
        d = digits[2:] if raw.startswith("00") else digits
        return any(d.startswith(c) for c in codes)
    # format local (souvent commence par 0) : on ne peut pas verifier le pays -> accepte
    return raw.startswith("0") or len(digits) >= 8


async def find_company_contact(
    client: httpx.AsyncClient, api_key: str, name: str, country: str | None, city: str | None = None
) -> dict | None:
    """Renvoie {phone,email,website,confidence,rationale} ou None. Seuls les champs
    qui CORRESPONDENT au nom de l'entreprise sont renseignes."""
    tokens = _tokens(name)
    if not tokens:
        return None
    query = " ".join(x for x in [name, city, country, "contact"] if x)
    try:
        r = await client.get(
            "https://api.piloterr.com/v2/google/search",
            params={"query": query}, headers={"x-api-key": api_key},
        )
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception:
        return None

    kg = data.get("knowledge_graph") or {}
    orgs = data.get("organic_results") or []

    # Site officiel : 1er domaine dont le nom de domaine matche le nom de l'entreprise.
    website = web_dom = None
    for o in orgs:
        dom = (o.get("domain") or "").lower()
        if dom.startswith("www."):
            dom = dom[4:]
        if dom and not _bad_domain(dom) and _name_match(dom.split(".")[0], tokens):
            web_dom = dom
            website = o.get("link") or f"https://{dom}"
            break

    # Email : dans les snippets, domaine email == site officiel OU matche le nom.
    email = None
    blob = " ".join(((o.get("snippet") or "") + " " + (o.get("title") or "")) for o in orgs[:6])
    for e in _EMAIL.findall(blob):
        el = e.lower()
        if any(b in el for b in _BAD_MAIL):
            continue
        edom = el.split("@", 1)[1]
        if _bad_domain(edom):
            continue
        if (web_dom and web_dom.split(".")[0] in edom) or _name_match(edom.split(".")[0], tokens):
            email = e
            break

    # Telephone : knowledge graph Google, titre name-matche + indicatif pays coherent.
    phone = None
    kgphone = (kg.get("attributes") or {}).get("Phone")
    if kgphone and _name_match(kg.get("title", ""), tokens) and _phone_ok(kgphone, country):
        phone = kgphone.strip()

    if not (phone or email or website):
        return None
    conf = 0.6 if (phone and email) else (0.55 if (phone or email) else 0.45)
    return {
        "phone": phone, "email": email, "website": website,
        "confidence": conf,
        "rationale": "Coordonnees via recherche web (Google/Piloterr) — a verifier",
    }
