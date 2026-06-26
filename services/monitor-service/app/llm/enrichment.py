"""
LLM enrichment pipeline — summarize, extract metadata, propose equipment needs.

Never called from the frontend. Always runs server-side via admin endpoint or batch job.
"""
from __future__ import annotations
import json
import logging
import re
import hashlib
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, ProjectEntity, ProjectContact, EquipmentNeed
from app.llm.client import get_llm_client
from app.llm.prompts import EXTRACT_PROMPT, EQUIPMENT_PROMPT

logger = logging.getLogger("monitor.llm.enrichment")

_ALLOWED_LLM_CATEGORIES = frozenset({
    "excavator", "loader", "dozer", "grader", "compactor", "dump_truck", "crusher", "drill",
    "generator", "water_truck", "mobile_crane", "telehandler", "aerial_platform", "paver",
    "concrete_mixer", "concrete_pump", "wheel_excavator", "tracked_excavator",
    "asphalt_plant", "batching_plant",
})

_EQUIPMENT_CATEGORY_ALIASES = {
    "excavatrice": "excavator",
    "pelle_hydraulique": "excavator",
    "pelle": "excavator",
    "tracked_excavator": "tracked_excavator",
    "wheel_excavator": "wheel_excavator",
    "pelle_sur_chenilles": "tracked_excavator",
    "pelle_sur_pneus": "wheel_excavator",
    "chargeuse": "loader",
    "bulldozer": "dozer",
    "niveleuse": "grader",
    "compacteur": "compactor",
    "camion_benne": "dump_truck",
    "concasseur": "crusher",
    "forage": "drill",
    "grue_mobile": "mobile_crane",
    "chariot_telecopique": "telehandler",
    "nacelle": "aerial_platform",
    "finisseur": "paver",
    "betonniere": "concrete_mixer",
    "pompe_beton": "concrete_pump",
    "centrale_enrobage": "asphalt_plant",
    "centrale_beton": "batching_plant",
}

_NON_MACHINE_KEYWORDS = {
    "textile", "cuir", "caoutchouc", "plastique",
    "assurance", "audit", "formation", "documentation", "imprim",
    "nettoyage", "gardiennage", "restauration", "fourniture",
    "produits", "médical", "pharmaceutique", "littér", "buanderie",
    "sport", "médailles", "articles artistiques", "services courants",
}
_WORKS_KEYWORDS = {
    "chantier", "terrassement", "excavation", "construction", "génie civil",
    "genie civil", "route", "autoroute", "pont", "barrage", "mine", "carrière",
    "carriere", "port", "rail", "voirie", "enrobé", "enrobe", "fondation",
    "pavage", "asphalte", "béton", "beton", "grutage", "levage",
}

_EXTRACTION_SYNONYMS: dict[str, tuple[str, ...]] = {
    "excavator": ("excavator", "excavatrice", "pelle hydraulique", "pelle"),
    "tracked_excavator": ("pelle sur chenilles",),
    "wheel_excavator": ("pelle sur pneus",),
    "loader": ("loader", "chargeuse", "chariot chargeur"),
    "dozer": ("dozer", "bulldozer", "bulldozer"),
    "grader": ("grader", "niveleuse"),
    "compactor": ("compactor", "compacteur", "rouleau"),
    "dump_truck": ("dump truck", "camion benne", "tombereau"),
    "crusher": ("crusher", "concasseur"),
    "drill": ("drill", "forage", "foreuse"),
    "mobile_crane": ("grue mobile", "mobile crane", "grue"),
    "telehandler": ("telehandler", "chariot telescopique", "chariot télescopique"),
    "aerial_platform": ("nacelle", "aerial platform"),
    "paver": ("paver", "finisseur"),
    "concrete_mixer": ("concrete mixer", "betonniere", "bétonnière"),
    "concrete_pump": ("concrete pump", "pompe a beton", "pompe à béton"),
    "asphalt_plant": ("asphalt plant", "centrale enrobage"),
    "batching_plant": ("batching plant", "centrale beton", "centrale béton"),
}

_QTY_WORD_TO_INT = {
    "un": 1,
    "une": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5,
    "six": 6,
    "sept": 7,
    "huit": 8,
    "neuf": 9,
    "dix": 10,
    "onze": 11,
    "douze": 12,
}

_EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b")
_PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?){2,5}\d{2,4}")
_URL_RE = re.compile(r"\bhttps?://[^\s)]+", re.IGNORECASE)

_ORG_HINTS = (
    "minist",
    "ministere",
    "agency",
    "agence",
    "autorit",
    "authority",
    "direction",
    "societe",
    "company",
    "ltd",
    "sarl",
    "sa ",
    "sa.",
)


def _safe_date(val: str | None) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _safe_decimal(val) -> Decimal | None:
    if val is None:
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError):
        return None


def _normalize_equipment_category(raw: str | None) -> str:
    if not isinstance(raw, str):
        return ""
    normalized = raw.strip().lower().replace("-", "_").replace(" ", "_")
    mapped = _EQUIPMENT_CATEGORY_ALIASES.get(normalized, normalized)
    if mapped in _ALLOWED_LLM_CATEGORIES:
        return mapped
    # Tolère légères variantes (ex. trailing s, underscores doublés)
    compact = re.sub(r"_+", "_", mapped).strip("_")
    if compact in _ALLOWED_LLM_CATEGORIES:
        return compact
    return ""


def _is_non_machine_project(project: Project, raw_text: str, source_text: str) -> bool:
    title = (project.title or "").lower()
    corpus = f"{title} {raw_text} {source_text}".lower()
    title_has_non_machine_signal = any(k in title for k in _NON_MACHINE_KEYWORDS)
    title_has_works_signal = any(k in title for k in _WORKS_KEYWORDS)
    if title_has_non_machine_signal and not title_has_works_signal:
        return True
    has_non_machine_signal = any(k in corpus for k in _NON_MACHINE_KEYWORDS)
    has_works_signal = any(k in corpus for k in _WORKS_KEYWORDS)
    # Prioritize textual evidence: non-machine tenders (supplies/services)
    # should not receive construction-machine proposals even if project type is noisy.
    return has_non_machine_signal and not has_works_signal


async def _fetch_source_context(url: str | None, limit_chars: int = 8000) -> str:
    """Fetch source URL and return a compact text snippet for LLM context."""
    if not url or not isinstance(url, str):
        return ""
    if not (url.startswith("http://") or url.startswith("https://")):
        return ""
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            res = await client.get(url, headers={"User-Agent": "MinegridMonitor/1.0"})
        if res.status_code < 200 or res.status_code >= 300:
            return ""
        content_type = (res.headers.get("content-type") or "").lower()
        if "text/html" not in content_type and "text/plain" not in content_type and "application/json" not in content_type:
            return ""
        raw = res.text or ""
        # Very lightweight HTML cleanup without external deps.
        text = re.sub(r"<script[\s\S]*?</script>", " ", raw, flags=re.IGNORECASE)
        text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:limit_chars]
    except Exception:
        return ""


def _build_equipment_user_context(project: Project, source_text: str) -> str:
    """Contexte texte enrichi pour EXTRACT + EQUIPMENT (titres docs, extraits plus longs)."""
    raw_text = ""
    if project.raw:
        raw_text = json.dumps(project.raw, ensure_ascii=False, default=str)[:6000]

    doc_titles: list[str] = []
    try:
        for d in project.documents or []:
            t = (d.title or "").strip()
            if t:
                doc_titles.append(t)
    except Exception:
        pass
    doc_blob = "\n".join(doc_titles[:40])[:3500]

    return (
        f"Titre: {project.title}\n"
        f"Type: {project.type or 'inconnu'}\n"
        f"Phase: {project.phase or 'inconnue'}\n"
        f"Pays: {project.country or 'inconnu'}\n"
        f"Région: {project.region or ''}\n"
        f"Budget: {project.budget_usd or 'inconnu'} USD\n"
        f"Source URL: {project.source_url or 'n/a'}\n"
        f"Titres documents (extraits):\n{doc_blob or '(aucun)'}\n"
        f"Données brutes (extrait): {raw_text[:3500]}\n"
        f"Contenu source (extrait): {source_text[:4500]}"
    )


def _extract_contacts_from_text(corpus: str, entities: list[ProjectEntity]) -> list[dict]:
    """
    Extraction déterministe des prospects (acheteur / gagnant / organisation de référence).
    On privilégie les contacts pro publics présents dans les AO.
    """
    text = (corpus or "").strip()
    if not text:
        return []
    text_lower = text.lower()
    contacts: list[dict] = []
    seen_keys: set[str] = set()

    emails = sorted({m.group(0).strip() for m in _EMAIL_RE.finditer(text)})[:12]
    phones = sorted({
        m.group(0).strip() for m in _PHONE_RE.finditer(text)
        if len(re.sub(r"\D", "", m.group(0))) >= 8 and not re.match(r"^\(\d{4,}\)", m.group(0).strip())
    })[:12]
    urls = sorted({m.group(0).strip() for m in _URL_RE.finditer(text)})[:8]

    entity_candidates: list[tuple[str, str]] = []
    for ent in entities or []:
        name = (ent.name or "").strip()
        if not name:
            continue
        role = (ent.role or "").strip().lower() or "unknown"
        entity_candidates.append((name, role))

    # Heuristique: si aucune entité structurée, on tente des lignes "winner/awarded/attributaire"
    if not entity_candidates:
        patterns = [
            r"(?:winner|awarded to|attributaire|adjug[ée]?\s*[àa])[:\s\-]+([A-Z][^\n,.;]{3,120})",
            r"(?:buyer|purchaser|acheteur|autorit[ée]\s*contractante)[:\s\-]+([A-Z][^\n,.;]{3,120})",
        ]
        for pat in patterns:
            for m in re.finditer(pat, text, flags=re.IGNORECASE):
                name = (m.group(1) or "").strip()
                if not name:
                    continue
                role = "winner" if "winner" in pat or "attributaire" in pat or "adjug" in pat else "buyer"
                entity_candidates.append((name, role))

    # Fallback organisation générale si rien
    if not entity_candidates:
        org = project_org = ""
        for line in re.split(r"[\n\.]", text)[:80]:
            line_l = line.lower()
            if any(h in line_l for h in _ORG_HINTS):
                org = line.strip()[:180]
                break
        if org:
            entity_candidates.append((org, "buyer"))

    for idx, (org_name, role) in enumerate(entity_candidates[:8]):
        email = emails[idx] if idx < len(emails) else (emails[0] if emails else None)
        phone = phones[idx] if idx < len(phones) else (phones[0] if phones else None)
        website = None
        for u in urls:
            if org_name.lower().split(" ")[0] in u.lower():
                website = u
                break
        if not website and urls:
            website = urls[0]
        key = f"{org_name.lower()}|{(email or '').lower()}|{(phone or '').lower()}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        contacts.append(
            {
                "organization": org_name[:300],
                "person_name": None,
                "role": role if role in {"buyer", "winner", "operator", "partner"} else "unknown",
                "email": email[:255] if isinstance(email, str) else None,
                "phone": phone[:80] if isinstance(phone, str) else None,
                "website": website[:500] if isinstance(website, str) else None,
                "address": None,
                "confidence": Decimal("0.78") if email or phone else Decimal("0.62"),
                "rationale": "[EXTRACT] contact prospect détecté dans l'appel d'offres",
            }
        )
    return contacts[:12]


def _upsert_project_contacts(
    project: Project,
    existing_rows: list[ProjectContact],
    contacts: list[dict],
    db: AsyncSession,
) -> tuple[int, int]:
    existing_by_key = {}
    for row in existing_rows:
        key = f"{(row.organization or '').strip().lower()}|{(row.email or '').strip().lower()}|{(row.phone or '').strip().lower()}"
        existing_by_key[key] = row

    seen_keys: set[str] = set()
    for c in contacts:
        key = f"{(c.get('organization') or '').strip().lower()}|{(c.get('email') or '').strip().lower()}|{(c.get('phone') or '').strip().lower()}"
        if not key.strip("|"):
            continue
        seen_keys.add(key)
        existing = existing_by_key.get(key)
        if existing:
            existing.person_name = c.get("person_name")
            existing.role = c.get("role")
            existing.website = c.get("website")
            existing.address = c.get("address")
            existing.confidence = _safe_decimal(c.get("confidence")) or Decimal("0.6")
            existing.rationale = str(c.get("rationale") or "")
        else:
            db.add(
                ProjectContact(
                    project_id=project.id,
                    organization=c.get("organization"),
                    person_name=c.get("person_name"),
                    role=c.get("role"),
                    email=c.get("email"),
                    phone=c.get("phone"),
                    website=c.get("website"),
                    address=c.get("address"),
                    confidence=_safe_decimal(c.get("confidence")) or Decimal("0.6"),
                    rationale=str(c.get("rationale") or ""),
                )
            )

    removed = 0
    for row in existing_rows:
        key = f"{(row.organization or '').strip().lower()}|{(row.email or '').strip().lower()}|{(row.phone or '').strip().lower()}"
        if key not in seen_keys:
            db.delete(row)
            removed += 1
    return len(seen_keys), removed


def _parse_qty_token(token: str | None) -> int | None:
    if not token:
        return None
    token_norm = token.strip().lower()
    if token_norm.isdigit():
        return int(token_norm)
    return _QTY_WORD_TO_INT.get(token_norm)


def _extract_needs_from_tender_text(corpus: str) -> list[dict]:
    """
    Extraction déterministe (non-LLM) depuis un corpus AO :
    - détecte catégories via synonymes
    - ancre qty quand une valeur numérique est trouvée près du terme
    """
    text = (corpus or "").lower()
    if not text:
        return []

    extracted: list[dict] = []
    for category, synonyms in _EXTRACTION_SYNONYMS.items():
        best_qty: int | None = None
        best_syn: str | None = None
        for syn in synonyms:
            syn_re = re.escape(syn)
            patterns = [
                # "3 pelles", "12 excavators"
                rf"\b(\d{{1,3}}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+{syn_re}s?\b",
                # "pelles x 3", "excavator x4"
                rf"\b{syn_re}s?\s*(?:x|×)\s*(\d{{1,3}})\b",
                # "lot ... 5 ... pelle"
                rf"\b{syn_re}s?\b.{0,40}\b(\d{{1,3}})\b",
                rf"\b(\d{{1,3}})\b.{0,40}\b{syn_re}s?\b",
            ]
            for p in patterns:
                m = re.search(p, text, flags=re.IGNORECASE)
                if not m:
                    continue
                qty = _parse_qty_token(m.group(1))
                if qty is None:
                    continue
                if best_qty is None or qty > best_qty:
                    best_qty = qty
                    best_syn = syn
        if best_qty is not None:
            qty_min = max(1, int(best_qty * 0.85))
            qty_max = max(qty_min, int(best_qty * 1.2))
            extracted.append(
                {
                    "category": category,
                    "qty_min": qty_min,
                    "qty_max": qty_max,
                    "confidence": Decimal("0.84"),
                    "rationale": f"[EXTRACT] quantité repérée dans AO autour de « {best_syn} »",
                }
            )
            continue

        # Pas de quantité explicite, mais terme présent -> signal faible
        if any(re.search(rf"\b{re.escape(s)}s?\b", text) for s in synonyms):
            extracted.append(
                {
                    "category": category,
                    "qty_min": 1,
                    "qty_max": 2,
                    "confidence": Decimal("0.62"),
                    "rationale": f"[EXTRACT] terme AO détecté sans quantité explicite",
                }
            )

    extracted.sort(key=lambda n: (n["confidence"], n["qty_max"]), reverse=True)
    return extracted[:12]


def _upsert_equipment_rows(
    project: Project,
    existing_rows: list[EquipmentNeed],
    needs: list[dict],
    db: AsyncSession,
) -> tuple[int, int]:
    existing_by_category = {
        row.category: row for row in existing_rows if isinstance(row.category, str)
    }
    seen_categories: set[str] = set()

    for need in needs:
        category = _normalize_equipment_category(need.get("category"))
        if not category:
            continue
        seen_categories.add(category)
        existing = existing_by_category.get(category)

        confidence = _safe_decimal(need.get("confidence")) or Decimal("0.5")
        rationale = str(need.get("rationale") or "")

        try:
            qty_min = max(0, int(need.get("qty_min") or 0))
            qty_max = max(0, int(need.get("qty_max") or 0))
        except (TypeError, ValueError):
            qty_min, qty_max = 0, 0
        if qty_max > 0 and qty_min > qty_max:
            qty_min, qty_max = qty_max, qty_min

        if existing:
            existing.qty_min = qty_min
            existing.qty_max = qty_max
            existing.confidence = confidence
            existing.rationale = rationale
        else:
            db.add(
                EquipmentNeed(
                    project_id=project.id,
                    category=category,
                    qty_min=qty_min,
                    qty_max=qty_max,
                    confidence=confidence,
                    rationale=rationale,
                )
            )

    removed = 0
    for row in existing_rows:
        if not isinstance(row.category, str):
            continue
        if row.category not in seen_categories:
            db.delete(row)
            removed += 1
    return len(seen_categories), removed


async def enrich_project(db: AsyncSession, project: Project) -> dict:
    """
    Run the full LLM enrichment pipeline on a single project.
    Returns a summary dict of what was updated.
    """
    client = get_llm_client()
    result = {"project_id": str(project.id), "steps": []}

    raw_text = ""
    if project.raw:
        raw_text = json.dumps(project.raw, ensure_ascii=False, default=str)[:6000]
    source_text = await _fetch_source_context(project.source_url)
    user_context = _build_equipment_user_context(project, source_text)

    # Step 1: Extract metadata (dates, budget, actors, locations)
    try:
        extract_resp = await client.complete(EXTRACT_PROMPT, user_context)
        extracted = json.loads(extract_resp.text)

        # Update dates if missing
        if not project.start_date:
            d = _safe_date(extracted.get("dates", {}).get("start"))
            if d:
                project.start_date = d
        if not project.end_date:
            d = _safe_date(extracted.get("dates", {}).get("end"))
            if d:
                project.end_date = d

        # Update budget if missing
        if not project.budget_usd:
            b = _safe_decimal(extracted.get("budget_usd"))
            if b:
                project.budget_usd = b

        # Add actors as entities
        actors = extracted.get("actors", [])
        for actor in actors:
            name = actor.get("name", "").strip()
            if not name:
                continue
            existing = (await db.execute(
                select(ProjectEntity).where(
                    ProjectEntity.project_id == project.id,
                    ProjectEntity.name == name,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(ProjectEntity(
                    project_id=project.id,
                    name=name,
                    role=actor.get("role", ""),
                ))

        result["steps"].append({
            "step": "extract",
            "actors_found": len(actors),
            "model": extract_resp.model,
            "tokens": extract_resp.tokens_used,
        })
    except Exception as exc:
        logger.warning("Extract step failed for %s: %s", project.id, exc)
        result["steps"].append({"step": "extract", "error": str(exc)})

    # Step 2: deterministic extraction from tender/source text (priority path)
    try:
        existing_entities = (
            await db.execute(select(ProjectEntity).where(ProjectEntity.project_id == project.id))
        ).scalars().all()
        doc_titles_blob = ""
        try:
            doc_titles_blob = " ".join((d.title or "") for d in (project.documents or []))
        except Exception:
            doc_titles_blob = ""
        corpus = " ".join(
            [
                project.title or "",
                raw_text,
                source_text,
                doc_titles_blob,
            ]
        )
        is_non_machine = _is_non_machine_project(project, raw_text, source_text)
        # Contacts/prospects : si le CONNECTEUR a deja fourni des contacts structures
        # (World Bank : awarded_supplier / contact_organization), on NE relance PAS l'extraction
        # heuristique — elle scrape de faux telephones depuis les ID WB entre parentheses et
        # ecraserait les contacts propres (laureat + maitre d'ouvrage).
        _raw = project.raw or {}
        has_structured_contacts = bool(_raw.get("awarded_supplier") or _raw.get("contact_organization"))
        if has_structured_contacts:
            result["steps"].append({"step": "contacts_extract", "skipped": "structured_contacts_present"})
        else:
            extracted_contacts = [] if is_non_machine else _extract_contacts_from_text(corpus, existing_entities)
            existing_contacts = (
                await db.execute(select(ProjectContact).where(ProjectContact.project_id == project.id))
            ).scalars().all()
            contacts_saved, contacts_removed = _upsert_project_contacts(
                project,
                existing_contacts,
                extracted_contacts,
                db,
            )
            result["steps"].append(
                {
                    "step": "contacts_extract",
                    "contacts_count": contacts_saved,
                    "removed": contacts_removed,
                }
            )

        extracted_needs = [] if is_non_machine else _extract_needs_from_tender_text(corpus)

        existing_rows = (
            await db.execute(select(EquipmentNeed).where(EquipmentNeed.project_id == project.id))
        ).scalars().all()
        saved_count, removed_count = _upsert_equipment_rows(project, existing_rows, extracted_needs, db)
        result["steps"].append(
            {
                "step": "equipment_extract",
                "needs_count": saved_count,
                "removed": removed_count,
            }
        )
    except Exception as exc:
        logger.warning("Deterministic extraction failed for %s: %s", project.id, exc)
        result["steps"].append({"step": "equipment_extract", "error": str(exc)})

    # Step 3: LLM fallback only if extraction is weak
    try:
        current_rows = (
            await db.execute(select(EquipmentNeed).where(EquipmentNeed.project_id == project.id))
        ).scalars().all()
        if len(current_rows) >= 2:
            result["steps"].append(
                {
                    "step": "equipment",
                    "skipped": True,
                    "reason": "deterministic extraction already produced enough needs",
                    "needs_count": len(current_rows),
                }
            )
            await db.commit()
            return result

        equip_resp = await client.complete(EQUIPMENT_PROMPT, user_context)
        equip_data = json.loads(equip_resp.text)
        needs = equip_data.get("equipment_needs", [])
        if _is_non_machine_project(project, raw_text, source_text):
            needs = []

        existing_rows = (
            await db.execute(select(EquipmentNeed).where(EquipmentNeed.project_id == project.id))
        ).scalars().all()
        llm_needs = []
        for need in needs:
            llm_needs.append(
                {
                    "category": need.get("category"),
                    "qty_min": need.get("qty_min"),
                    "qty_max": need.get("qty_max"),
                    "confidence": need.get("confidence"),
                    "rationale": f"[LLM] {need.get('rationale', '')}",
                }
            )
        saved_count, removed_count = _upsert_equipment_rows(project, existing_rows, llm_needs, db)

        result["steps"].append({
            "step": "equipment",
            "needs_count": saved_count,
            "removed": removed_count,
            "model": equip_resp.model,
            "tokens": equip_resp.tokens_used,
        })
    except Exception as exc:
        logger.warning("Equipment step failed for %s: %s", project.id, exc)
        result["steps"].append({"step": "equipment", "error": str(exc)})

    await db.commit()
    return result


async def enrich_projects_batch(
    db: AsyncSession,
    limit: int = 50,
    force: bool = False,
) -> list[dict]:
    """
    Batch enrich projects that haven't been enriched yet.
    By default, only enriches projects with no equipment_needs in DB.
    Set force=True to re-enrich all.
    """
    query = select(Project).order_by(Project.updated_at.desc()).limit(limit)

    if not force:
        # Only projects without equipment needs
        from sqlalchemy import exists
        has_needs = (
            select(EquipmentNeed.id)
            .where(EquipmentNeed.project_id == Project.id)
            .exists()
        )
        query = query.where(~has_needs)

    result = await db.execute(query)
    projects = result.scalars().all()

    logger.info("Enriching %d projects (force=%s)", len(projects), force)

    results = []
    for project in projects:
        try:
            r = await enrich_project(db, project)
            results.append(r)
            logger.info("Enriched: %s", project.title)
        except Exception as exc:
            logger.error("Failed to enrich %s: %s", project.id, exc)
            results.append({"project_id": str(project.id), "error": str(exc)})

    return results


async def analyze_project_debug(project: Project) -> dict:
    """
    Admin debug helper:
    - builds the exact context sent to LLM
    - returns proof metadata (hash, model, tokens, timestamp)
    - returns normalized equipment candidates (without DB write)
    """
    settings_provider = "mock"
    client = get_llm_client()

    source_text = await _fetch_source_context(project.source_url)
    user_context = _build_equipment_user_context(project, source_text)
    context_hash = hashlib.sha256(user_context.encode("utf-8")).hexdigest()

    resp = await client.complete(EQUIPMENT_PROMPT, user_context)
    settings_provider = "openai" if "gpt" in (resp.model or "").lower() else settings_provider
    parsed = json.loads(resp.text)
    needs = parsed.get("equipment_needs", [])
    source_extracted = _extract_needs_from_tender_text(user_context)
    normalized = []
    for need in needs:
        category = _normalize_equipment_category(need.get("category"))
        if not category:
            continue
        normalized.append({
            "category": category,
            "qty_min": need.get("qty_min", 0),
            "qty_max": need.get("qty_max", 0),
            "confidence": need.get("confidence", 0.5),
            "rationale": need.get("rationale", ""),
        })

    return {
        "project_id": str(project.id),
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
        "provider": settings_provider,
        "model": resp.model,
        "tokens_used": resp.tokens_used,
        "context_hash": context_hash,
        "context_sizes": {
            "source_chars": len(source_text),
            "prompt_chars": len(user_context),
        },
        "deterministic_extraction_preview": source_extracted[:20],
        "equipment_needs_preview": normalized[:20],
    }


def _normalize_preview_item(item: dict) -> dict:
    category = _normalize_equipment_category(item.get("category"))
    if not category:
        return {}
    qty_min = max(0, int(item.get("qty_min") or 0))
    qty_max = max(0, int(item.get("qty_max") or 0))
    if qty_max > 0 and qty_min > qty_max:
        qty_min, qty_max = qty_max, qty_min
    return {
        "category": category,
        "qty_min": qty_min,
        "qty_max": qty_max,
        "confidence": float(_safe_decimal(item.get("confidence")) or Decimal("0.5")),
        "rationale": str(item.get("rationale") or ""),
    }


async def compare_project_methods(project: Project) -> dict:
    """
    Compare deterministic extraction vs LLM output without writing to DB.
    Useful for admin QA/audit.
    """
    source_text = await _fetch_source_context(project.source_url)
    raw_text = ""
    if project.raw:
        raw_text = json.dumps(project.raw, ensure_ascii=False, default=str)[:6000]
    user_context = _build_equipment_user_context(project, source_text)

    corpus = " ".join(
        [
            project.title or "",
            raw_text,
            source_text,
            " ".join((d.title or "") for d in (project.documents or [])),
        ]
    )
    deterministic = _extract_needs_from_tender_text(corpus)
    deterministic_norm = [_normalize_preview_item(x) for x in deterministic]
    deterministic_norm = [x for x in deterministic_norm if x]

    llm_norm: list[dict] = []
    llm_meta: dict = {"called": False}
    if not _is_non_machine_project(project, raw_text, source_text):
        client = get_llm_client()
        llm_meta["called"] = True
        resp = await client.complete(EQUIPMENT_PROMPT, user_context)
        llm_meta.update({"model": resp.model, "tokens": resp.tokens_used})
        parsed = json.loads(resp.text)
        llm_raw = parsed.get("equipment_needs", [])
        llm_norm = [_normalize_preview_item(x) for x in llm_raw]
        llm_norm = [x for x in llm_norm if x]

    det_categories = {x["category"] for x in deterministic_norm}
    llm_categories = {x["category"] for x in llm_norm}
    intersection = sorted(det_categories & llm_categories)
    only_det = sorted(det_categories - llm_categories)
    only_llm = sorted(llm_categories - det_categories)

    def _qty_span_sum(items: list[dict]) -> int:
        return sum(max(0, (it.get("qty_max", 0) - it.get("qty_min", 0))) for it in items)

    return {
        "project_id": str(project.id),
        "deterministic_count": len(deterministic_norm),
        "llm_count": len(llm_norm),
        "agreement": {
            "intersection_count": len(intersection),
            "intersection_categories": intersection,
            "only_deterministic": only_det,
            "only_llm": only_llm,
        },
        "spread": {
            "deterministic_qty_span_sum": _qty_span_sum(deterministic_norm),
            "llm_qty_span_sum": _qty_span_sum(llm_norm),
        },
        "llm_meta": llm_meta,
        "deterministic_preview": deterministic_norm[:20],
        "llm_preview": llm_norm[:20],
    }
