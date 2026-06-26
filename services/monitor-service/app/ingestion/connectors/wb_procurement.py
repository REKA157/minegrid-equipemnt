"""World Bank Procurement Notices connector (STRUCTURE, MULTI-PAYS).

Source de qualite couvrant ~tous les pays membres :
  https://search.worldbank.org/api/v2/procnotices?format=json&rows=...&os=...

Apporte les deux faces de la vision :
  - AVIS D'APPEL D'OFFRES (Invitation for Bids / EOI) -> phase 'tender', avec le
    MAITRE D'OUVRAGE (contact_organization) ;
  - ATTRIBUTIONS (Contract Award) -> phase 'awarded', avec le LAUREAT (« Awarded
    Bidder(s): … ») parse depuis notice_text.

La pertinence engins/BTP est assuree en aval par upsert (relevance.py) : les marches
hors-sujet (fournitures de bureau, services…) sont rejetes.
"""
from __future__ import annotations

import re
from decimal import Decimal

import httpx

from app.ingestion.base import BaseConnector
from app.ingestion.asset import ProjectAsset
from app.ingestion.target_markets import is_target_country

_DEFAULT_BASE = "https://search.worldbank.org/api/v2/procnotices"
_TYPE_MINING = {  # mapping grossier notice/text -> type projet
    "mine": "mine", "mining": "mine", "carriere": "mine",
    "route": "road", "road": "road", "highway": "road", "pont": "road", "bridge": "road",
    "port": "port", "harbour": "port", "harbor": "port",
    "rail": "rail", "railway": "rail",
    "dam": "dam", "barrage": "dam", "hydro": "dam",
    "power": "energy", "solar": "energy", "electric": "energy", "energie": "energy",
}


def _strip_html(h: str | None) -> str:
    if not h:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).strip()


def _first_line(s: str | None, maxlen: int = 220) -> str:
    s = (s or "").strip()
    line = s.splitlines()[0].strip() if s else ""
    return line[:maxlen]


def _guess_type(text: str) -> str:
    t = (text or "").lower()
    for k, v in _TYPE_MINING.items():
        if k in t:
            return v
    return "btp"  # WB CW/works par defaut


_SUPPLIER_RE = re.compile(r"Awarded Bidder\(s\):\s*([^()\n<]+?)\s*\(\d+\)", re.I)
_SUPPLIER_RE_FALLBACK = re.compile(r"Awarded Bidder\(s\):\s*([^\n<]{2,80})", re.I)


def _extract_supplier(notice_text_plain: str) -> str | None:
    m = _SUPPLIER_RE.search(notice_text_plain) or _SUPPLIER_RE_FALLBACK.search(notice_text_plain)
    if not m:
        return None
    name = m.group(1).strip(" .,-")
    return name or None


class WBProcurementConnector(BaseConnector):
    name = "wb_procurement"

    async def fetch(self) -> list[ProjectAsset]:
        base_url = self.config.get("base_url", _DEFAULT_BASE)
        max_items = int(self.config.get("max_items", 2000))
        page_rows = min(500, int(self.config.get("page_rows", 200)))
        # Groupes a EXCLURE (CS = consulting services). On garde CW (travaux), GO (biens),
        # NC (non-consulting) car certains marches de travaux y sont classes.
        exclude_groups = {g.upper() for g in self.config.get("exclude_groups", ["CS"])}
        # Si True : ne garder que les marches cibles MineGrid (Afrique/Maghreb/MO/Europe).
        restrict_target = bool(self.config.get("restrict_to_target_markets", False))

        assets: list[ProjectAsset] = []
        async with httpx.AsyncClient(timeout=45, headers={"User-Agent": "Mozilla/5.0 (MinegridMonitor/1.0)"}) as client:
            offset = 0
            while len(assets) < max_items:
                params = {"format": "json", "rows": page_rows, "os": offset, "srt": "noticedate", "order": "desc"}
                try:
                    resp = await client.get(base_url, params=params)
                    resp.raise_for_status()
                    notices = resp.json().get("procnotices", [])
                except Exception as exc:
                    self.logger.warning("WB procurement fetch error (os=%s): %s", offset, exc)
                    break
                if not notices:
                    break

                for n in notices:
                    group = (n.get("procurement_group") or "").upper()
                    if group in exclude_groups:
                        continue
                    country = (n.get("project_ctry_name") or "").strip()
                    if restrict_target and country and not is_target_country(country):
                        continue

                    notice_type = (n.get("notice_type") or "").strip()
                    is_award = "award" in notice_type.lower()
                    phase = "awarded" if is_award else "tender"

                    desc = n.get("bid_description") or n.get("project_name") or ""
                    title = _first_line(desc) or _first_line(n.get("project_name"))
                    if not title:
                        continue

                    text_plain = _strip_html(n.get("notice_text"))
                    # Texte de scoring + marqueurs role (pour relevance + extraction contacts).
                    source_text_parts = [desc, text_plain]
                    supplier = _extract_supplier(text_plain) if is_award else None
                    if supplier:
                        # « Attributaire : … » -> capte par l'extraction (role winner).
                        source_text_parts.append(f"Attributaire : {supplier}.")
                    org = (n.get("contact_organization") or "").strip()
                    if org and not is_award:
                        source_text_parts.append(f"Maitre d'ouvrage : {org}.")

                    project_id = n.get("project_id") or ""
                    source_url = (
                        n.get("contact_web_url")
                        or (f"https://projects.worldbank.org/en/projects-operations/project-detail/{project_id}" if project_id else base_url)
                    )

                    assets.append(
                        ProjectAsset(
                            title=title,
                            country=country,
                            region="",
                            type=_guess_type(f"{title} {text_plain[:300]}"),
                            phase=phase,
                            budget_usd=None,
                            source="World Bank Procurement",
                            source_url=source_url,
                            raw={
                                "source_type": "mdb",
                                "wb_notice_id": n.get("id"),
                                "notice_type": notice_type,
                                "procurement_group": group,
                                "project_id": project_id,
                                "project_name": n.get("project_name"),
                                "awarded_supplier": supplier,
                                "contact_organization": org or None,
                                "contact_name": n.get("contact_name") or None,
                                "contact_email": n.get("contact_email") or None,
                                "contact_phone": n.get("contact_phone_no") or None,
                                "submission_deadline": n.get("submission_deadline_date") or None,
                                "source_text": " ".join(p for p in source_text_parts if p)[:4000],
                                "notice_text": n.get("notice_text"),
                            },
                            confidence=Decimal("0.85"),
                        )
                    )
                    if len(assets) >= max_items:
                        break

                offset += page_rows

        self.logger.info("Fetched %d assets from World Bank Procurement", len(assets))
        return assets
