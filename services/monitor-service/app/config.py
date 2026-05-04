from __future__ import annotations

import warnings
from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache

_WEAK_ADMIN_TOKENS = {"", "changeme-admin-token-2026", "changeme", "admin"}


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://monitor:monitor@localhost:5432/monitor_db"
    database_pool_size: int = 10
    database_max_overflow: int = 20

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    admin_token: str = ""

    allowed_origins: str = (
        "http://localhost:5173,"
        "http://localhost:5174,"
        "http://localhost:5175,"
        "http://localhost:5176"
    )

    geocoder_mode: str = "none"
    mapbox_token: str = ""
    nominatim_url: str = "http://localhost:8080"

    piloterr_api_key: str = ""

    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    ingest_interval_hours: int = 3
    enrich_interval_hours: int = 12
    alerts_interval_hours: int = 6
    mascus_interval_hours: int = 12

    # Widgets IA : limite de requêtes / minute / utilisateur (anti-surcharge & coût LLM)
    ai_widget_max_per_minute: int = 120
    # Cache court du payload LLM agrégé (insights+reco+predictions partagés même construction)
    payload_cache_ttl_sec: float = 45.0

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @field_validator("admin_token")
    @classmethod
    def _warn_weak_token(cls, v: str) -> str:
        if v in _WEAK_ADMIN_TOKENS:
            warnings.warn(
                "ADMIN_TOKEN is missing or weak — set a strong value in .env",
                stacklevel=2,
            )
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
