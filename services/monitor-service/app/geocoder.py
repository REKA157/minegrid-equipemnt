"""
Geocoder module — multi-provider, cached, rate-limited.

Providers:
  - self_hosted_nominatim : Your own Nominatim instance (no usage policy issues)
  - photon              : Komoot Photon (free, based on OSM, no strict rate limit)
  - mapbox              : Mapbox Geocoding API (requires MAPBOX_TOKEN)
  - none                : Disabled

IMPORTANT — Nominatim usage policy (nominatim.openstreetmap.org):
  - Max 1 request/second, no bulk geocoding
  - Must provide a valid User-Agent
  - Do NOT use the public instance for large volumes
  - In production, self-host Nominatim or use a paid provider

This module uses Photon by default (free, no API key needed, OSM-based).
"""
from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import GeocodeCache
from app.geocoder_centroids import country_centroid

logger = logging.getLogger("monitor.geocoder")

RATE_LIMIT_DELAY = 1.1  # seconds between requests (safe for all providers)
MAX_RETRIES = 2


@dataclass
class GeoResult:
    lat: float
    lon: float
    confidence: Decimal
    provider: str
    from_cache: bool = False


# ---- Cache layer ----

async def get_cached(db: AsyncSession, query: str) -> GeoResult | None:
    result = await db.execute(
        select(GeocodeCache).where(GeocodeCache.query == query)
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    # Cache valid for 90 days
    if row.updated_at and (datetime.utcnow() - row.updated_at) > timedelta(days=90):
        return None
    return GeoResult(
        lat=row.lat,
        lon=row.lon,
        confidence=Decimal(str(row.confidence)) if row.confidence else Decimal("0.5"),
        provider=row.provider,
        from_cache=True,
    )


async def set_cache(db: AsyncSession, query: str, result: GeoResult):
    existing = (
        await db.execute(select(GeocodeCache).where(GeocodeCache.query == query))
    ).scalar_one_or_none()

    if existing:
        existing.lat = result.lat
        existing.lon = result.lon
        existing.confidence = result.confidence
        existing.provider = result.provider
        existing.updated_at = datetime.utcnow()
    else:
        db.add(GeocodeCache(
            query=query,
            lat=result.lat,
            lon=result.lon,
            confidence=result.confidence,
            provider=result.provider,
        ))
    await db.commit()


# ---- Providers ----

async def _geocode_photon(query: str) -> GeoResult | None:
    """Komoot Photon — free, OSM-based, no API key."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://photon.komoot.io/api/",
            params={"q": query, "limit": 1},
        )
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        return None

    coords = features[0]["geometry"]["coordinates"]  # [lon, lat]
    props = features[0].get("properties", {})
    osm_type = props.get("osm_type", "")
    confidence = Decimal("0.7") if osm_type == "N" else Decimal("0.5")

    return GeoResult(lat=coords[1], lon=coords[0], confidence=confidence, provider="photon")


async def _geocode_nominatim(query: str, base_url: str) -> GeoResult | None:
    """Self-hosted Nominatim instance."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{base_url}/search",
            params={"q": query, "format": "json", "limit": 1},
            headers={"User-Agent": "MinegridMonitor/1.0"},
        )
        resp.raise_for_status()
        data = resp.json()

    if not data:
        return None

    hit = data[0]
    importance = float(hit.get("importance", 0.5))
    confidence = Decimal(str(round(min(importance, 1.0), 2)))

    return GeoResult(
        lat=float(hit["lat"]),
        lon=float(hit["lon"]),
        confidence=confidence,
        provider="nominatim",
    )


async def _geocode_mapbox(query: str, token: str) -> GeoResult | None:
    """Mapbox Geocoding API."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json",
            params={"access_token": token, "limit": 1, "language": "fr"},
        )
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        return None

    coords = features[0]["center"]  # [lon, lat]
    relevance = features[0].get("relevance", 0.5)

    return GeoResult(
        lat=coords[1],
        lon=coords[0],
        confidence=Decimal(str(round(relevance, 2))),
        provider="mapbox",
    )


# ---- Main geocode function ----

async def geocode(
    db: AsyncSession,
    title: str,
    region: str,
    country: str,
) -> GeoResult | None:
    """
    Geocode a project location with cache + rate limiting + retry.
    Returns None if geocoding is disabled or fails.
    """
    settings = get_settings()
    mode = settings.geocoder_mode

    if mode == "none":
        return None

    parts = [p for p in [title, region, country] if p and p.strip()]
    query = ", ".join(parts)
    if not query:
        return None

    # Check cache first
    cached = await get_cached(db, query)
    if cached:
        logger.debug("Cache hit for: %s", query)
        return cached

    # Rate limiting
    await asyncio.sleep(RATE_LIMIT_DELAY)

    # Try geocoding with retries
    result: GeoResult | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if mode == "photon":
                result = await _geocode_photon(query)
            elif mode == "self_hosted_nominatim":
                result = await _geocode_nominatim(query, settings.nominatim_url)
            elif mode == "mapbox":
                if not settings.mapbox_token:
                    logger.warning("Mapbox mode but no MAPBOX_TOKEN configured")
                    return None
                result = await _geocode_mapbox(query, settings.mapbox_token)
            else:
                logger.warning("Unknown geocoder mode: %s", mode)
                return None

            if result:
                break

        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                wait = (attempt + 1) * 2
                logger.warning("Rate limited, waiting %ds (attempt %d)", wait, attempt + 1)
                await asyncio.sleep(wait)
            else:
                logger.warning("Geocode HTTP error: %s", exc)
                break
        except Exception as exc:
            logger.warning("Geocode error (attempt %d): %s", attempt + 1, exc)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(1)

    # Save to cache
    if result:
        await set_cache(db, query, result)
        logger.debug("Geocoded: %s -> (%s, %s) [%s]", query, result.lat, result.lon, result.provider)

    return result


async def enrich_coordinates(
    db: AsyncSession,
    title: str,
    region: str,
    country: str,
    existing_lat: float | None,
    existing_lon: float | None,
) -> tuple[float | None, float | None]:
    """
    Enrich project with coordinates if missing.
    Returns (lat, lon) — either existing or newly geocoded.
    """
    if existing_lat is not None and existing_lon is not None:
        return existing_lat, existing_lon

    result = await geocode(db, title, region, country)
    if result:
        return result.lat, result.lon

    # Repli hors-ligne : centroide pays (la carte ne doit jamais etre vide).
    centroid = country_centroid(country)
    if centroid:
        return centroid

    return existing_lat, existing_lon
