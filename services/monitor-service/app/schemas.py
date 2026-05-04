from __future__ import annotations
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from typing import Any
from pydantic import BaseModel, Field


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


class EquipmentNeedOut(BaseModel):
    id: UUID
    category: str | None
    qty_min: int | None
    qty_max: int | None
    confidence: Decimal | None
    rationale: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


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
