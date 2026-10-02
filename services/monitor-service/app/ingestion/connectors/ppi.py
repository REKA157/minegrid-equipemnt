"""PPI Database connector — parses CSV/STATA exports from /data/.

Config:
  file_path: path to the CSV (relative to /app/data/)
  delimiter: CSV delimiter (default: ,)
  encoding: file encoding (default: utf-8)
  country_filter: optional list of ISO2 codes
"""
from __future__ import annotations
import csv
from decimal import Decimal, InvalidOperation
from datetime import date
from pathlib import Path
from app.ingestion.base import BaseConnector
from app.ingestion.asset import ProjectAsset


def _parse_date(val: str) -> date | None:
    if not val:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y"):
        try:
            return date.fromisoformat(val) if fmt == "%Y-%m-%d" else date(int(val), 1, 1) if fmt == "%Y" else None
        except (ValueError, TypeError):
            continue
    return None


def _parse_decimal(val: str) -> Decimal | None:
    if not val:
        return None
    try:
        cleaned = val.replace(",", "").replace("$", "").replace(" ", "").strip()
        return Decimal(cleaned) if cleaned else None
    except (InvalidOperation, ValueError):
        return None


class PPIConnector(BaseConnector):
    name = "ppi"

    async def fetch(self) -> list[ProjectAsset]:
        base_dir = Path(__file__).parent.parent.parent.parent
        file_path = Path(self.config.get("file_path", "data/ppi_projects.csv"))
        if not file_path.is_absolute():
            file_path = base_dir / file_path
        file_path = file_path.resolve()
        # Constaté le 2026-10-01 : la comparaison de PRÉFIXE de chaîne acceptait
        # un dossier voisin (« /app2/x.csv » commence par « /app »). On exige
        # désormais que le fichier soit réellement SOUS le dossier du service.
        if not file_path.is_relative_to(base_dir.resolve()):
            self.logger.error("Path traversal blocked: %s", file_path)
            return []

        if not file_path.exists():
            self.logger.warning("PPI file not found: %s", file_path)
            return []

        delimiter = self.config.get("delimiter", ",")
        encoding = self.config.get("encoding", "utf-8")
        country_filter: set[str] | None = None
        if self.config.get("country_filter"):
            country_filter = {c.upper() for c in self.config["country_filter"]}

        assets: list[ProjectAsset] = []

        with open(file_path, newline="", encoding=encoding) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            for row in reader:
                country = (row.get("country") or row.get("Country") or "").strip()
                if country_filter and country.upper() not in country_filter:
                    continue

                title = (
                    row.get("project_name")
                    or row.get("Project Name")
                    or row.get("title")
                    or ""
                ).strip()
                if not title:
                    continue

                asset = ProjectAsset(
                    title=title,
                    country=country,
                    region=row.get("region", row.get("Region", "")),
                    type=self._map_type(row.get("sector", row.get("Sector", ""))),
                    phase=self._map_phase(row.get("status", row.get("Status", ""))),
                    budget_usd=_parse_decimal(row.get("total_investment", row.get("Total Investment", ""))),
                    start_date=_parse_date(row.get("financial_closure", row.get("Financial Closure", ""))),
                    source="PPI Database",
                    source_url=row.get("url", "https://ppi.worldbank.org"),
                    raw=dict(row),
                    confidence=Decimal("0.7"),
                )
                assets.append(asset)

        self.logger.info("Parsed %d assets from PPI file %s", len(assets), file_path.name)
        return assets

    @staticmethod
    def _map_type(sector: str) -> str:
        s = sector.lower()
        mapping = {
            "mining": "mine", "mine": "mine", "minerals": "mine",
            "transport": "road", "energy": "energy", "water": "dam",
            "telecom": "infrastructure", "port": "port", "rail": "rail",
        }
        for key, val in mapping.items():
            if key in s:
                return val
        return "infrastructure"

    @staticmethod
    def _map_phase(status: str) -> str:
        s = status.lower()
        if "construct" in s:
            return "construction"
        if "oper" in s:
            return "ops"
        if "cancel" in s or "distress" in s:
            return "study"
        return "financing"
