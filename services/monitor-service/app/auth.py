from __future__ import annotations

import time
import hmac
import logging
from uuid import UUID
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.config import get_settings, Settings

import httpx

logger = logging.getLogger("monitor.auth")
bearer_scheme = HTTPBearer(auto_error=False)

_PAID_SUBSCRIPTION_TYPES = {"premium", "pro", "enterprise", "entreprise"}
_PAID_CACHE_TTL_SEC = 60
# Limite mémoire en prod (beaucoup d’utilisateurs uniques sur la durée)
_PAID_CACHE_MAX_KEYS = 8000
_paid_access_cache: dict[str, tuple[bool, float]] = {}


def _paid_cache_set(user_id: str, allowed: bool, expiry_ts: float) -> None:
    _paid_access_cache[user_id] = (allowed, expiry_ts)
    if len(_paid_access_cache) <= _PAID_CACHE_MAX_KEYS:
        return
    excess = len(_paid_access_cache) - _PAID_CACHE_MAX_KEYS
    for k in list(_paid_access_cache.keys())[:excess]:
        del _paid_access_cache[k]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> UUID:
    """Verify Supabase JWT and return user_id."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token manquant")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token invalide")
    return UUID(sub)


async def require_admin(
    x_admin_token: str = Header(..., alias="X-Admin-Token"),
    settings: Settings = Depends(get_settings),
) -> bool:
    """Check admin token from header — constant-time comparison."""
    if not settings.admin_token:
        logger.error("ADMIN_TOKEN not configured — rejecting all admin requests")
        raise HTTPException(status_code=503, detail="Service non configuré")
    if not hmac.compare_digest(x_admin_token.encode(), settings.admin_token.encode()):
        raise HTTPException(status_code=403, detail="Admin token invalide")
    return True


async def require_user_or_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_admin_token: str | None = Header(None, alias="X-Admin-Token"),
    settings: Settings = Depends(get_settings),
) -> bool:
    """Allow access with either a valid user JWT or admin token."""
    if credentials:
        try:
            payload = jwt.decode(
                credentials.credentials,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            sub = payload.get("sub")
            if sub:
                return True
        except JWTError:
            # Fallback robuste: vérifier le token auprès de Supabase Auth
            if settings.supabase_url and settings.supabase_service_role_key:
                auth_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
                auth_headers = {
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                }
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        auth_res = await client.get(auth_url, headers=auth_headers)
                    if 200 <= auth_res.status_code < 300:
                        auth_data = auth_res.json()
                        uid = auth_data.get("id")
                        if isinstance(uid, str) and uid:
                            return True
                except Exception:
                    pass

    if x_admin_token and settings.admin_token:
        if hmac.compare_digest(x_admin_token.encode(), settings.admin_token.encode()):
            return True

    raise HTTPException(status_code=401, detail="Token utilisateur ou admin requis")


async def require_paid_user_or_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_admin_token: str | None = Header(None, alias="X-Admin-Token"),
    settings: Settings = Depends(get_settings),
) -> bool:
    """
    Autoriser :
    - l'admin via X-Admin-Token
    - uniquement les utilisateurs ayant une formule payante active dans `pro_clients`
    """
    if x_admin_token and settings.admin_token:
        if hmac.compare_digest(x_admin_token.encode(), settings.admin_token.encode()):
            return True

    # JWT utilisateur requis
    if not credentials:
        raise HTTPException(status_code=401, detail="Token utilisateur requis")

    user_id: str | None = None

    # 1) Vérification locale JWT (rapide)
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        sub = payload.get("sub")
        if sub:
            user_id = str(sub)
    except JWTError:
        pass

    # 2) Fallback robuste: valider le token auprès de Supabase Auth
    if not user_id and settings.supabase_url and settings.supabase_service_role_key:
        auth_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
        auth_headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {credentials.credentials}",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                auth_res = await client.get(auth_url, headers=auth_headers)
            if 200 <= auth_res.status_code < 300:
                auth_data = auth_res.json()
                uid = auth_data.get("id")
                if isinstance(uid, str) and uid:
                    user_id = uid
        except Exception:
            pass

    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide")

    # Cache in-memory pour éviter de requêter Supabase à chaque page/fetch
    now = time.time()
    cached = _paid_access_cache.get(user_id)
    if cached and cached[1] > now:
        allowed = cached[0]
        if allowed:
            return True
        raise HTTPException(status_code=403, detail="Abonnement payant requis")

    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase non configuré")

    base = settings.supabase_url.rstrip("/")
    url = (
        f"{base}/rest/v1/pro_clients"
        f"?select=subscription_type,subscription_status"
        f"&user_id=eq.{user_id}"
        f"&order=created_at.desc"
        f"&limit=20"
    )

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, headers=headers)
    except httpx.HTTPError as e:
        logger.error("Paid check Supabase request failed: %s", e)
        raise HTTPException(status_code=503, detail="Erreur Supabase")

    if res.status_code < 200 or res.status_code >= 300:
        body = res.text[:2000]
        logger.error("Paid check Supabase bad status %s: %s", res.status_code, body)
        # Fallback de secours: certains environnements n'ont pas encore la table
        # `pro_clients` créée. Dans ce cas précis, on ne bloque pas l'accès Live
        # pour les utilisateurs authentifiés.
        if res.status_code == 404 and "public.pro_clients" in body:
            logger.warning(
                "Fallback paid access enabled for user_id=%s because public.pro_clients is missing",
                user_id,
            )
            _paid_cache_set(user_id, True, now + _PAID_CACHE_TTL_SEC)
            return True
        raise HTTPException(status_code=403, detail="Abonnement payant requis")

    try:
        rows = res.json()
    except Exception:
        rows = None

    valid_row = None
    if isinstance(rows, list):
        for candidate in rows:
            if not isinstance(candidate, dict):
                continue
            c_type = candidate.get("subscription_type")
            c_status = candidate.get("subscription_status")
            if (
                isinstance(c_type, str)
                and isinstance(c_status, str)
                and c_status.lower() in {"active", "trialing", "paid"}
                and _PAID_SUBSCRIPTION_TYPES.issuperset({c_type.lower()})
            ):
                valid_row = candidate
                break

    sub_type = (valid_row or {}).get("subscription_type")
    sub_status = (valid_row or {}).get("subscription_status")
    allowed = valid_row is not None

    _paid_cache_set(user_id, allowed, now + _PAID_CACHE_TTL_SEC)

    if not allowed:
        logger.info(
            "Paid access denied user_id=%s subscription_type=%s subscription_status=%s",
            user_id,
            sub_type,
            sub_status,
        )
        raise HTTPException(status_code=403, detail="Abonnement payant requis")
    return True
