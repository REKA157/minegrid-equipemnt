"""Connector registry — discovers, configures and runs connectors."""
from __future__ import annotations
import logging
import yaml
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingestion.base import BaseConnector
from app.ingestion.upsert import upsert_assets
from app.ingestion.connectors.wb_data360 import WBData360Connector
from app.ingestion.connectors.ppi import PPIConnector
from app.ingestion.connectors.ocds_feed import OCDSConnector
from app.ingestion.connectors.mascus import MascusConnector
from app.ingestion.connectors.leboncoin import LeboncoinConnector
from app.ingestion.connectors.public_portals import PublicPortalsConnector
from app.ingestion.connectors.mdb_procurement import MDBProcurementConnector
from app.ingestion.connectors.wb_procurement import WBProcurementConnector
from app.schemas import IngestResult

logger = logging.getLogger("monitor.registry")

CONNECTOR_MAP: dict[str, type[BaseConnector]] = {
    "wb_data360": WBData360Connector,
    "ppi": PPIConnector,
    "ocds_feed": OCDSConnector,
    "mascus": MascusConnector,
    "leboncoin": LeboncoinConnector,
    "public_portals": PublicPortalsConnector,
    "mdb_procurement": MDBProcurementConnector,
    "wb_procurement": WBProcurementConnector,
}

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent.parent / "sources.yaml"


def load_sources(path: Path | None = None) -> list[dict]:
    p = path or DEFAULT_CONFIG_PATH
    if not p.exists():
        logger.warning("No sources.yaml found at %s", p)
        return []
    with open(p) as f:
        data = yaml.safe_load(f)
    return data.get("sources", [])


async def run_all(db: AsyncSession, config_path: Path | None = None) -> IngestResult:
    sources = load_sources(config_path)
    total = IngestResult()

    for src in sources:
        if not src.get("enabled", True):
            logger.info("Skipping disabled source: %s", src.get("name"))
            continue

        connector_type = src.get("connector")
        cls = CONNECTOR_MAP.get(connector_type)
        if not cls:
            msg = f"Unknown connector type: {connector_type}"
            logger.warning(msg)
            total.errors += 1
            total.details.append(msg)
            continue

        logger.info("Running connector: %s (%s)", src.get("name"), connector_type)
        try:
            connector = cls(config=src.get("config", {}))
            assets = await connector.fetch()
            result = await upsert_assets(db, assets)
            total.inserted += result.inserted
            total.updated += result.updated
            total.skipped += result.skipped
            total.errors += result.errors
            total.details.extend(result.details)
            logger.info(
                "  %s: inserted=%d updated=%d errors=%d",
                src.get("name"), result.inserted, result.updated, result.errors,
            )
        except Exception as exc:
            msg = f"Connector {src.get('name')} failed: {exc}"
            logger.error(msg)
            total.errors += 1
            total.details.append(msg)

    return total
