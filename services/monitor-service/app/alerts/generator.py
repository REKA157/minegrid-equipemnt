"""
Alert event generator.

After each ingestion run, compares new/updated projects against all user alert rules.
Generates alert_events for matches (avoids duplicates within 24h window).

Constaté le 2026-10-01 (audit du 2026-09-08) : malgré la phrase ci-dessus, la
génération ne tournait QUE toutes les 6 h (scheduler.py, ALERTS_INTERVAL_HOURS),
jamais en fin d'ingestion : une règle correspondant à un nouveau projet restait
« Aucun événement récent » jusqu'à 6 h. `generate_alerts_after_ingest` est
désormais appelée à la fin de chaque ingestion qui a inséré ou mis à jour au
moins un projet (planificateur, /admin/ingest/run, imports CSV/JSON, /sources).

Anti-doublons (inchangé sur le fond) : un seul événement par (utilisateur,
projet) dans la fenêtre `since_hours` (24 h), quel que soit le nombre de règles
ou d'exécutions. Deux renforts, nécessaires maintenant que la génération peut
tourner plus souvent :
  - un verrou sérialise les exécutions dans le processus (fin d'ingestion et
    tâche des 6 h ne peuvent plus se chevaucher et insérer deux fois) ;
  - la recherche du doublon lit au plus UNE ligne : `scalar_one_or_none()`
    levait MultipleResultsFound dès que deux événements existaient déjà, ce qui
    bloquait TOUTE la génération pendant 24 h.

Limite : aucun canal e-mail / push / webhook n'existe ; l'utilisateur voit les
événements en ouvrant l'onglet alertes du Global Monitor.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, AlertRule, AlertEvent
from app.alerts.evaluator import evaluate_rule

logger = logging.getLogger("monitor.alerts.generator")

# Un seul passage de génération à la fois dans ce processus (un worker uvicorn).
_generation_lock = asyncio.Lock()


async def generate_alert_events(
    db: AsyncSession,
    since_hours: int = 24,
) -> dict:
    """
    Evaluate all alert rules against recently updated projects.
    Generates alert_events for matches.
    """
    async with _generation_lock:
        return await _generate_alert_events_locked(db, since_hours)


async def _generate_alert_events_locked(db: AsyncSession, since_hours: int) -> dict:
    cutoff = datetime.utcnow() - timedelta(hours=since_hours)

    # Fetch recently updated projects
    result = await db.execute(
        select(Project).where(Project.updated_at >= cutoff)
    )
    recent_projects = result.scalars().all()

    if not recent_projects:
        logger.info("No recently updated projects (since %dh)", since_hours)
        return {"projects_checked": 0, "rules_checked": 0, "events_created": 0}

    # Fetch all alert rules
    rules_result = await db.execute(select(AlertRule))
    all_rules = rules_result.scalars().all()

    if not all_rules:
        logger.info("No alert rules configured")
        return {"projects_checked": len(recent_projects), "rules_checked": 0, "events_created": 0}

    events_created = 0

    for rule_row in all_rules:
        rule_dict = rule_row.rule or {}
        for project in recent_projects:
            if not evaluate_rule(rule_dict, project):
                continue

            # Check for duplicate event within 24h window
            existing = (await db.execute(
                select(AlertEvent.id).where(and_(
                    AlertEvent.user_id == rule_row.user_id,
                    AlertEvent.project_id == project.id,
                    AlertEvent.created_at >= cutoff,
                )).limit(1)
            )).scalar_one_or_none()

            if existing:
                continue

            db.add(AlertEvent(
                user_id=rule_row.user_id,
                project_id=project.id,
                event_type="rule_match",
                payload={
                    "rule_id": str(rule_row.id),
                    "rule": rule_dict,
                    "project_title": project.title,
                    "project_country": project.country,
                    "project_type": project.type,
                    "project_phase": project.phase,
                    "project_budget": float(project.budget_usd) if project.budget_usd else None,
                },
            ))
            events_created += 1

    await db.commit()

    logger.info(
        "Alert generation: %d projects × %d rules -> %d events",
        len(recent_projects), len(all_rules), events_created,
    )
    return {
        "projects_checked": len(recent_projects),
        "rules_checked": len(all_rules),
        "events_created": events_created,
    }


async def generate_alerts_after_ingest(db: AsyncSession, ingest_result) -> dict | None:
    """À appeler à la fin d'une ingestion : génère les alertes si des projets ont bougé.

    « Ingestion réussie » = au moins un projet inséré ou mis à jour. Sinon rien
    de nouveau à évaluer : la tâche des 6 h couvre les règles créées entre-temps.
    Un échec ici ne doit JAMAIS faire échouer l'ingestion, déjà enregistrée.
    """
    inserted = int(getattr(ingest_result, "inserted", 0) or 0)
    updated = int(getattr(ingest_result, "updated", 0) or 0)
    if inserted + updated <= 0:
        logger.info("Fin d'ingestion sans projet nouveau ou modifié : pas de génération d'alertes")
        return None
    try:
        result = await generate_alert_events(db)
    except Exception:
        logger.exception(
            "Génération des alertes après ingestion en échec (l'ingestion, elle, est "
            "enregistrée ; nouvel essai à la prochaine ingestion ou dans 6 h)"
        )
        try:
            await db.rollback()
        except Exception:
            pass
        return None
    logger.info("Alertes générées en fin d'ingestion : %s", result)
    return result
