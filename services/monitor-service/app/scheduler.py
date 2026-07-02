import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import AsyncSessionLocal
from app.config import get_settings
from app.ingestion.registry import run_all

logger = logging.getLogger("monitor.scheduler")

scheduler = AsyncIOScheduler()


async def scheduled_ingest():
    """Periodic ingestion job — runs all enabled connectors from sources.yaml."""
    logger.info("Scheduled ingest started")
    async with AsyncSessionLocal() as db:
        result = await run_all(db)
    logger.info(
        "Scheduled ingest complete: inserted=%d updated=%d errors=%d",
        result.inserted, result.updated, result.errors,
    )


async def scheduled_enrich():
    """Periodic LLM enrichment — enrich projects without equipment_needs."""
    settings = get_settings()
    if settings.llm_provider == "none":
        logger.debug("LLM enrichment skipped (provider=none)")
        return

    logger.info("Scheduled LLM enrichment started")
    from app.llm.enrichment import enrich_projects_batch
    async with AsyncSessionLocal() as db:
        results = await enrich_projects_batch(db, limit=20)
    logger.info("Scheduled enrichment complete: %d projects processed", len(results))


async def scheduled_alerts():
    """Periodic alert generation — evaluate rules against recent projects."""
    logger.info("Scheduled alert generation started")
    from app.alerts.generator import generate_alert_events
    async with AsyncSessionLocal() as db:
        result = await generate_alert_events(db)
    logger.info("Alert generation complete: %s", result)


async def scheduled_mascus_import():
    """Periodic Mascus equipment import via Piloterr API."""
    import os
    if not os.environ.get("PILOTERR_API_KEY"):
        logger.debug("Mascus import skipped (PILOTERR_API_KEY not set)")
        return

    logger.info("Scheduled Mascus import started")
    from app.ingestion.connectors.mascus import MascusConnector
    from app.ingestion.machine_upsert import upsert_machines

    connector = MascusConnector()
    machines = await connector.fetch_machines()
    if machines:
        result = await upsert_machines(machines)
        logger.info(
            "Mascus import complete: fetched=%d inserted=%d updated=%d errors=%d",
            len(machines), result.inserted, result.updated, result.errors,
        )
    else:
        logger.info("Mascus import: no machines fetched")


async def scheduled_winner_enrich():
    """Enrichissement periodique des coordonnees des laureats (recherche web Piloterr).
    Desactive si PILOTERR_API_KEY absente. Plafonne par execution (cout credits)."""
    settings = get_settings()
    api_key = settings.piloterr_api_key
    if not api_key:
        logger.debug("Winner contact enrichment skipped (PILOTERR_API_KEY not set)")
        return

    logger.info("Scheduled winner enrichment started")
    from app.ingestion.company_contacts import enrich_pending_winners
    async with AsyncSessionLocal() as db:
        tried, filled = await enrich_pending_winners(
            db, api_key, limit=settings.enrich_contacts_max_per_run
        )
    logger.info("Winner enrichment complete: tried=%d filled=%d", tried, filled)


def start_scheduler():
    settings = get_settings()
    scheduler.add_job(
        scheduled_ingest,
        "interval",
        hours=max(1, settings.ingest_interval_hours),
        id="ingest_job",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_enrich,
        "interval",
        hours=max(1, settings.enrich_interval_hours),
        id="enrich_job",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_alerts,
        "interval",
        hours=max(1, settings.alerts_interval_hours),
        id="alerts_job",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_mascus_import,
        "interval",
        hours=max(1, settings.mascus_interval_hours),
        id="mascus_job",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_winner_enrich,
        "interval",
        hours=max(1, settings.enrich_contacts_interval_hours),
        id="winner_enrich_job",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started — ingest %dh, enrich %dh, alerts %dh, mascus %dh, winner_enrich %dh",
        max(1, settings.ingest_interval_hours),
        max(1, settings.enrich_interval_hours),
        max(1, settings.alerts_interval_hours),
        max(1, settings.mascus_interval_hours),
        max(1, settings.enrich_contacts_interval_hours),
    )


def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
