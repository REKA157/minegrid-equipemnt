"""Connecteur OCDS (Open Contracting Data Standard) — tenders + ATTRIBUTIONS (gagnants).

Deux modes (config 'mode') :
  - 'api'           : endpoint pagine de release packages ({releases:[...], links:{next}})
  - 'bulk_jsonl_gz' : fichier .jsonl.gz (1 release/record/package par ligne), lu en STREAMING
                      (decompression incrementale -> on s'arrete a max_items sans tout charger)

Pour chaque marche : extrait l'attributaire (awards[].suppliers -> contact 'winner' via raw),
le maitre d'ouvrage (buyer -> contact 'buyer'), convertit le montant en USD. Dedup par ocid
(prefere l'avis d'attribution au simple avis). La pertinence engins/BTP est filtree a l'upsert.

Config: feed_url, mode, source_name, country_default, restrict_to_target_markets (def True),
        max_items, max_pages, params (query string additionnels: dateFrom, PageSize, opt_schema...).
"""
from __future__ import annotations

import json
import zlib
from decimal import Decimal

import httpx

from app.ingestion.base import BaseConnector
from app.ingestion.asset import ProjectAsset
from app.ingestion.currency import amount_to_usd
from app.ingestion.target_markets import is_target_country

_UA = {"User-Agent": "Mozilla/5.0 (MinegridMonitor/1.0)"}
_TYPE = {
    "mine": "mine", "mining": "mine", "minier": "mine", "carriere": "mine", "quarry": "mine",
    "road": "road", "highway": "road", "route": "road", "pont": "road", "bridge": "road",
    "port": "port", "harbour": "port", "rail": "rail", "railway": "rail", "ferro": "rail",
    "dam": "dam", "barrage": "dam", "hydro": "dam",
    "power": "energy", "solar": "energy", "electric": "energy", "energie": "energy", "energy": "energy",
}


def _guess_type(text: str) -> str:
    t = (text or "").lower()
    for k, v in _TYPE.items():
        if k in t:
            return v
    return "infrastructure"


class OCDSConnector(BaseConnector):
    name = "ocds_feed"

    async def fetch(self) -> list[ProjectAsset]:
        feed_url = (self.config.get("feed_url") or "").strip()
        if not feed_url:
            self.logger.warning("No feed_url configured for OCDS connector")
            return []
        self._country_default = self.config.get("country_default", "")
        self._source_name = self.config.get("source_name", "OCDS")
        self._restrict = bool(self.config.get("restrict_to_target_markets", True))
        self._max_items = int(self.config.get("max_items", 1500))
        by_ocid: dict[str, ProjectAsset] = {}
        mode = (self.config.get("mode") or "api").lower()
        try:
            if mode == "bulk_jsonl_gz":
                await self._fetch_bulk(feed_url, by_ocid)
            else:
                await self._fetch_api(feed_url, by_ocid)
        except Exception as exc:
            self.logger.warning("OCDS fetch failed (%s): %s", self._source_name, exc)
        assets = list(by_ocid.values())
        self.logger.info("Fetched %d assets from OCDS %s", len(assets), self._source_name)
        return assets

    def _collect(self, by_ocid: dict, rel: dict) -> bool:
        """Ajoute/maj un asset par ocid (prefere awarded). Retourne True si on doit s'arreter."""
        a = self._parse_release(rel)
        if a:
            key = a.source_url or a.title
            cur = by_ocid.get(key)
            if cur is None or (a.phase == "awarded" and cur.phase != "awarded"):
                by_ocid[key] = a
        return len(by_ocid) >= self._max_items

    async def _fetch_api(self, feed_url: str, by_ocid: dict) -> None:
        params = self.config.get("params", {}) or {}
        max_pages = int(self.config.get("max_pages", 40))
        async with httpx.AsyncClient(timeout=45, headers=_UA, follow_redirects=True) as client:
            url, first = feed_url, True
            for _ in range(max_pages):
                resp = await client.get(url, params=params if first else None)
                resp.raise_for_status()
                data = resp.json()
                first = False
                for rel in self._releases_from(data):
                    if self._collect(by_ocid, rel):
                        return
                nxt = (data.get("links") or {}).get("next")
                if not nxt:
                    break
                url = nxt

    async def _fetch_bulk(self, feed_url: str, by_ocid: dict) -> None:
        params = self.config.get("params", {}) or {}
        dec = zlib.decompressobj(16 + zlib.MAX_WBITS)  # gzip
        buf = b""  # on accumule des OCTETS et on decode par LIGNE (evite de couper l'UTF-8)
        async with httpx.AsyncClient(timeout=180, headers=_UA, follow_redirects=True) as client:
            async with client.stream("GET", feed_url, params=params) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=131072):
                    # gzip MULTI-MEMBRES : enchainer les membres (sinon on s'arrete au 1er).
                    cur = chunk
                    while cur:
                        buf += dec.decompress(cur)
                        if dec.eof:
                            cur = dec.unused_data
                            dec = zlib.decompressobj(16 + zlib.MAX_WBITS)
                        else:
                            cur = b""
                    while b"\n" in buf:
                        rawline, buf = buf.split(b"\n", 1)
                        try:  # UTF-8 d'abord, repli latin-1 (certains exports France DECP)
                            line = rawline.decode("utf-8").strip()
                        except UnicodeDecodeError:
                            line = rawline.decode("latin-1").strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except Exception:
                            continue
                        for rel in self._releases_from(obj):
                            if self._collect(by_ocid, rel):
                                return

    @staticmethod
    def _releases_from(obj) -> list:
        if not isinstance(obj, dict):
            return []
        if isinstance(obj.get("releases"), list):
            return obj["releases"]
        if isinstance(obj.get("records"), list):
            return [r.get("compiledRelease") or {} for r in obj["records"] if isinstance(r, dict)]
        if obj.get("ocid") or obj.get("tender"):
            return [obj]
        return []

    def _parse_release(self, rel: dict) -> ProjectAsset | None:
        if not isinstance(rel, dict):
            return None
        tender = rel.get("tender") or {}
        awards = [a for a in (rel.get("awards") or []) if isinstance(a, dict) and a.get("suppliers")]
        buyer = rel.get("buyer") or {}

        # Titre : tender.title -> award.title -> description -> 1er item -> maitre d'ouvrage.
        title = (tender.get("title") or "").strip()
        if not title and awards:
            title = (awards[0].get("title") or "").strip()
        if not title:
            title = (tender.get("description") or "").strip()
        if not title:
            items = list(tender.get("items") or [])
            if awards:
                items += list(awards[0].get("items") or [])
            for it in items:
                d = (it.get("description") or (it.get("classification") or {}).get("description") or "").strip()
                if d:
                    title = d
                    break
        if not title and (buyer.get("name") or "").strip():
            title = f"Marché public — {buyer.get('name').strip()}"
        title = title[:220]
        if not title or title.isdigit() or len(title) < 4:
            return None
        country = ((buyer.get("address") or {}).get("countryName") or "").strip() or self._country_default
        if self._restrict and country and not is_target_country(country):
            return None

        budget = amount_to_usd((tender.get("value") or {}).get("amount"), (tender.get("value") or {}).get("currency"))
        supplier = None
        if awards:
            sup = awards[0].get("suppliers") or [{}]
            supplier = (sup[0].get("name") or "").strip() or None
            av = awards[0].get("value") or {}
            if not budget:
                budget = amount_to_usd(av.get("amount"), av.get("currency"))

        is_award = bool(supplier)
        org = (buyer.get("name") or "").strip() or None
        parts = [title]
        if supplier:
            parts.append(f"Attributaire : {supplier}.")
        if org:
            parts.append(f"Maitre d'ouvrage : {org}.")
        ocid = rel.get("ocid") or rel.get("id") or ""

        return ProjectAsset(
            title=title,
            country=country,
            region="",
            type=_guess_type(title),
            phase="awarded" if is_award else "tender",
            budget_usd=budget,
            source=f"OCDS - {self._source_name}",
            source_url=str(ocid or rel.get("id") or ""),
            raw={
                "source_type": "ocds",
                "ocid": ocid,
                "procurement_category": (tender.get("mainProcurementCategory") or "").lower() or None,
                "awarded_supplier": supplier,
                "contact_organization": org,
                "source_text": " ".join(parts)[:4000],
                "ocds_tag": rel.get("tag"),
            },
            confidence=Decimal("0.72"),
        )
