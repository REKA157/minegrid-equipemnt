from __future__ import annotations
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from typing import Any
from pydantic import BaseModel, Field, model_validator

from app.llm.mock_client import MOCK_EQUIPMENT_NEEDS


# ---------- Project ----------

class ProjectBase(BaseModel):
    title: str
    type: str | None = None
    phase: str | None = None
    country: str | None = None
    region: str | None = None
    lat: float | None = None
    lon: float | None = None
    budget_usd: Decimal | None = None
    start_date: date | None = None
    end_date: date | None = None
    source: str | None = None
    source_url: str | None = None


class ProjectCreate(ProjectBase):
    raw: dict[str, Any] | None = None
    fingerprint: str
    confidence: Decimal = Decimal("0.5")


class DocumentOut(BaseModel):
    id: UUID
    title: str | None
    url: str | None
    doc_type: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class EntityOut(BaseModel):
    id: UUID
    name: str | None
    role: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class ContactOut(BaseModel):
    id: UUID
    organization: str | None
    person_name: str | None
    role: str | None
    email: str | None
    phone: str | None
    website: str | None
    address: str | None
    confidence: Decimal | None
    rationale: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# Préfixes de `rationale` posés par le radar, et la source qu'ils désignent.
_RATIONALE_SOURCES = (
    ("[estimated]", "estimation"),  # règles type/phase/budget (routes/projects.py)
    ("[EXTRACT]", "extraction"),    # texte de l'appel d'offres (llm/enrichment.py, sans IA)
    ("[LLM]", "ia"),                # proposition de l'IA (llm/enrichment.py)
)


def _source_from_rationale(rationale: str | None) -> str | None:
    text = (rationale or "").lstrip()
    for prefix, source in _RATIONALE_SOURCES:
        if text.startswith(prefix):
            return source
    return None


# Constaté le 2026-10-01 (relecture, REV-5) : avant la correction F3, une base
# enrichie sans clé d'IA (LLM_PROVIDER=none, valeur par défaut) a pu
# enregistrer les 5 besoins FABRIQUÉS du client simulé (« [LLM] Excavation
# lourde requise pour ce type de projet », pelles 4-8…). Relus sans ?ai=true,
# ils sortaient source="ia" : le front les croisait avec le stock. On les
# reconnaît à leur signature EXACTE (catégorie + quantités + texte) — une
# vraie IA qui écrirait la même phrase avec d'autres quantités n'est pas
# touchée — et on les sert simulated=true, source="simulation".
_MOCK_NEED_SIGNATURES = frozenset(
    (n["category"], n["qty_min"], n["qty_max"], n["rationale"]) for n in MOCK_EQUIPMENT_NEEDS
)


def _is_mock_need(category: str | None, qty_min: int | None, qty_max: int | None, rationale: str | None) -> bool:
    text = (rationale or "").strip()
    if text.startswith("[LLM]"):
        text = text[len("[LLM]"):].strip()
    return (category, qty_min, qty_max, text) in _MOCK_NEED_SIGNATURES


class EquipmentNeedOut(BaseModel):
    id: UUID
    category: str | None
    qty_min: int | None
    qty_max: int | None
    confidence: Decimal | None
    rationale: str | None
    created_at: datetime
    # -----------------------------------------------------------------------
    # Constaté le 2026-10-01 : un besoin ESTIMÉ (repli par règles de
    # GET /projects/{id} quand aucun besoin n'est en base) ne se distinguait
    # d'un besoin réel que par le texte « [estimated] » en tête de `rationale`
    # (et un id nul partagé). Le front devait deviner. Contrat partagé avec le
    # front, point (c) : un besoin estimé ne sert JAMAIS au croisement avec le
    # stock, au score d'opportunité ni à la mention « compatible ».
    #   - estimated : true pour une estimation (champ fiable, booléen) ;
    #   - source    : « estimation » | « extraction » | « ia » | null (inconnue),
    #                 déduite du préfixe de `rationale`, conservé tel quel.
    # Les deux sont recalculés depuis `rationale` : une estimation reste
    # marquée même si un appelant oublie de poser le drapeau.
    #   - simulated : true pour un besoin écrit en base par le client IA
    #                 SIMULÉ (REV-5, voir _is_mock_need) ; source vaut alors
    #                 « simulation ». Contrat (a) : jamais croisé avec le stock,
    #                 quantités jamais affichées comme des données (le front
    #                 lit déjà EquipmentNeed.simulated).
    # -----------------------------------------------------------------------
    estimated: bool = False
    source: str | None = None
    simulated: bool = False
    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _mark_origin(self) -> "EquipmentNeedOut":
        if _is_mock_need(self.category, self.qty_min, self.qty_max, self.rationale):
            self.simulated = True
            self.source = "simulation"
            return self
        derived = _source_from_rationale(self.rationale)
        if self.source is None:
            self.source = derived or ("estimation" if self.estimated else None)
        if derived == "estimation" or self.source == "estimation":
            self.estimated = True
        return self


class ProjectOut(ProjectBase):
    id: UUID
    fingerprint: str
    confidence: Decimal | None
    updated_at: datetime | None
    model_config = {"from_attributes": True}


class ProjectDetailOut(ProjectOut):
    documents: list[DocumentOut] = []
    entities: list[EntityOut] = []
    contacts: list[ContactOut] = []
    equipment_needs: list[EquipmentNeedOut] = []
    # Contrat partagé avec le front, point (a) — constaté le 2026-10-01 : un
    # détail demandé avec ?ai=true ne disait pas si une vraie IA avait été
    # utilisée. true = aucune IA n'est configurée sur le radar (rien dans ce
    # détail ne vient d'une IA) ; false = vraie IA ; null = IA non demandée.
    simulated: bool | None = None


class ProjectListOut(BaseModel):
    items: list[ProjectOut]
    total: int
    page: int
    page_size: int


# ---------- Alerts ----------

class AlertRuleCreate(BaseModel):
    rule: dict[str, Any]


class AlertRuleOut(BaseModel):
    id: UUID
    user_id: UUID
    rule: dict[str, Any]
    created_at: datetime
    model_config = {"from_attributes": True}


class AlertEventOut(BaseModel):
    id: UUID
    user_id: UUID
    project_id: UUID | None
    event_type: str | None
    payload: dict[str, Any] | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ---------- Admin ----------

class IngestResult(BaseModel):
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    details: list[str] = Field(default_factory=list)


class HealthOut(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    service: str = "monitor-service"
    # Constaté le 2026-10-01 : le radar en ligne était antérieur aux gardes de
    # paywall du dépôt (commit 4b27cfc6 du 12/08) et rien ne permettait de le
    # voir. Ces deux champs disent QUEL code tourne : commit court et date de
    # construction de l'image, posés au `docker compose build` (ARG BUILD_SHA /
    # BUILD_DATE du Dockerfile). « inconnue » = image construite sans eux.
    build_sha: str = "inconnue"
    build_date: str = "inconnue"


# ---------- Data Sources ----------

class DataSourceCreate(BaseModel):
    name: str
    connector_type: str
    url: str | None = None
    enabled: bool = True
    config: dict[str, Any] = {}


class DataSourceUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    enabled: bool | None = None
    config: dict[str, Any] | None = None


class DataSourceOut(BaseModel):
    id: UUID
    name: str
    connector_type: str
    url: str | None
    enabled: bool
    config: dict[str, Any]
    last_run_at: datetime | None
    stats: dict[str, Any]
    created_at: datetime
    model_config = {"from_attributes": True}
