import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Text, Float, Numeric, Date, DateTime,
    Integer, ForeignKey, UniqueConstraint, Index, JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def new_uuid():
    return uuid.uuid4()


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    title = Column(String(500), nullable=False)
    type = Column(String(100))           # mine, road, port, rail, dam, etc.
    phase = Column(String(100))          # study, financing, tender, construction, ops
    country = Column(String(100))
    region = Column(String(200))
    lat = Column(Float)
    lon = Column(Float)
    budget_usd = Column(Numeric(18, 2))
    start_date = Column(Date)
    end_date = Column(Date)
    source = Column(String(200))
    source_url = Column(Text)
    raw = Column(JSON)
    fingerprint = Column(String(64), unique=True, nullable=False, index=True)
    confidence = Column(Numeric(3, 2), default=0.5)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")
    entities = relationship("ProjectEntity", back_populates="project", cascade="all, delete-orphan")
    contacts = relationship("ProjectContact", back_populates="project", cascade="all, delete-orphan")
    equipment_needs = relationship("EquipmentNeed", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_projects_country_type_phase", "country", "type", "phase"),
        Index("ix_projects_updated_at", "updated_at"),
        Index("ix_projects_lat_lon", "lat", "lon"),
    )


class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500))
    url = Column(Text)
    doc_type = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="documents")


class ProjectEntity(Base):
    __tablename__ = "project_entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(300))
    role = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="entities")


class ProjectContact(Base):
    __tablename__ = "project_contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    organization = Column(String(300))
    person_name = Column(String(200))
    role = Column(String(100))  # buyer | winner | operator | partner | unknown
    email = Column(String(255))
    phone = Column(String(80))
    website = Column(Text)
    address = Column(Text)
    confidence = Column(Numeric(3, 2), default=0.5)
    rationale = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="contacts")


class EquipmentNeed(Base):
    __tablename__ = "equipment_needs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100))       # excavator, loader, dozer, etc.
    qty_min = Column(Integer)
    qty_max = Column(Integer)
    confidence = Column(Numeric(3, 2))
    rationale = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="equipment_needs")


class Profile(Base):
    __tablename__ = "profiles"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    plan = Column(String(50), default="free")
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSavedProject(Base):
    __tablename__ = "user_saved_projects"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    rule = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    event_type = Column(String(100))
    payload = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    query = Column(Text, primary_key=True)
    lat = Column(Float)
    lon = Column(Float)
    confidence = Column(Numeric(3, 2), default=0.5)
    provider = Column(String(50), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name = Column(String(200), nullable=False)
    connector_type = Column(String(100), nullable=False)   # wb_data360, ppi, ocds_feed
    url = Column(Text)
    enabled = Column(Integer, default=1)                    # 1=enabled, 0=disabled
    config = Column(JSON, default=dict)
    last_run_at = Column(DateTime)
    stats = Column(JSON, default=dict)                      # {inserted, updated, errors, ...}
    created_at = Column(DateTime, default=datetime.utcnow)
