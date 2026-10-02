from __future__ import annotations

import asyncio
import hashlib
import time
import hmac
import logging
from typing import Any
from uuid import UUID
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jws, jwt
from jose.exceptions import JOSEError
from app.config import get_settings, Settings

import httpx

logger = logging.getLogger("monitor.auth")
bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Formules qui ouvrent le radar.
#
# Constaté le 2026-10-01 : la liste contenait aussi le code interne 'pro'.
# Nomenclature croisée (src/config/plans.ts) : code 'pro' = plan AFFICHÉ
# « Premium » 20 $ (gestion du parc, SANS radar) ; code 'premium' = plan affiché
# « Pro » 50 $ (« Radar d'opportunités »). Le site réserve toutes les pages qui
# appellent le radar au code 'premium' et plus (App.tsx : paidRoute('premium')
# pour #global-monitor et #opportunites-vente, paidRoute('enterprise') pour les
# cockpits qui lisent /projects/{id} et les widgets IA). Vérifié par recherche
# dans src/ : aucun écran du palier 'pro' (ProDashboard, ApiDocs, pages/pro/*)
# n'importe monitorApi, aiWidgetService, sellerOpportunities ni
# buildMonitorContextForLeadSourceIds, et l'historique git n'en montre jamais.
# Garder 'pro' laissait un abonné 20 $ lire le radar en appelant l'API en direct.
# ---------------------------------------------------------------------------
_PAID_SUBSCRIPTION_TYPES = {"premium", "enterprise", "entreprise"}
_PAID_CACHE_TTL_SEC = 60
# Limite mémoire en prod (beaucoup d’utilisateurs uniques sur la durée)
_PAID_CACHE_MAX_KEYS = 8000
_paid_access_cache: dict[str, tuple[bool, float]] = {}
# Réponse 503 quand la plateforme ne permet pas de vérifier l'abonnement (voir
# require_paid_user_or_admin) : une panne n'est jamais présentée comme un
# défaut d'abonnement du client.
_SUBSCRIPTION_CHECK_UNAVAILABLE = (
    "Vérification de l'abonnement impossible pour le moment : le service "
    "d'abonnements de la plateforme ne répond pas correctement. Réessayez dans "
    "quelques minutes."
)


def _paid_cache_set(user_id: str, allowed: bool, expiry_ts: float) -> None:
    _paid_access_cache[user_id] = (allowed, expiry_ts)
    if len(_paid_access_cache) <= _PAID_CACHE_MAX_KEYS:
        return
    excess = len(_paid_access_cache) - _PAID_CACHE_MAX_KEYS
    for k in list(_paid_access_cache.keys())[:excess]:
        del _paid_access_cache[k]


# ---------------------------------------------------------------------------
# Vérification des jetons Supabase — UNE seule fonction pour les trois gardes.
#
# Constaté le 2026-10-01 : les jetons n'étaient vérifiés qu'en HS256 avec
# SUPABASE_JWT_SECRET (« secret hérité »). Or le projet Supabase de production
# publie une clé asymétrique : GET <SUPABASE_URL>/auth/v1/.well-known/jwks.json
# renvoie 1 clé alg=ES256 kty=EC. Conséquences dès que les jetons utilisateurs
# sont signés ES256 :
#   - get_current_user (alertes, widgets IA) n'avait AUCUN repli : 401
#     « Token invalide » pour tout le monde ;
#   - require_user_or_admin et require_paid_user_or_admin retombaient sur un
#     appel réseau /auth/v1/user à CHAQUE requête (lenteur, dépendance réseau) ;
#   - le quota LLM de GET /projects/{id}?ai=true (fondé sur get_current_user)
#     était sauté : l'échec était pris pour un accès administrateur.
#
# Désormais : on lit l'en-tête du jeton (sans lui faire confiance), puis
#   - HS256 → vérifié avec le secret hérité (anciens jetons, projets non migrés) ;
#   - ES256 / RS256 → vérifié avec la clé publique du JWKS du projet (URL dérivée
#     de SUPABASE_URL), mise en cache 10 min, rechargée si le `kid` est inconnu
#     (rotation de clé) au plus une fois toutes les 30 s ;
#   - tout autre algorithme (dont « none ») → refusé.
# Audience « authenticated » et expiration exigées : PRÉSENTES et valides
# (python-jose ignore une audience absente si on ne la rend pas obligatoire).
#
# ATTENTION — la présence d'une clé ES256 dans le JWKS NE PROUVE PAS que les
# jetons sont signés en ES256 : Supabase publie la future clé (« standby ») dans
# le JWKS AVANT de signer avec elle. Le projet peut donc encore signer en HS256.
#
# Deux sortes d'échec, traitées différemment :
#   - REFUS DÉFINITIF → 401 sans appel réseau : jeton expiré, mauvaise audience,
#     revendication manquante, en-tête illisible, et signature ES256/RS256 fausse
#     (la clé publique vient de Supabase lui-même : Supabase refuserait aussi) ;
#   - VÉRIFICATION IMPOSSIBLE ici → repli sur Supabase Auth /auth/v1/user, en
#     dernier recours : secret absent, JWKS injoignable, clé inconnue même après
#     rechargement, et signature HS256 fausse (voir plus bas : le secret du
#     serveur peut être périmé ou venir d'un autre projet).
# ---------------------------------------------------------------------------
_SUPABASE_AUDIENCE = "authenticated"
# Algorithme annoncé dans l'en-tête → type de clé attendu dans le JWKS.
# Lier les deux empêche la « confusion d'algorithme » (jeton HS256 signé avec
# une clé publique, etc.).
_ASYMMETRIC_ALGS = {"ES256": "EC", "RS256": "RSA"}
_JWKS_TTL_SEC = 600.0
_JWKS_FORCED_RELOAD_MIN_INTERVAL_SEC = 30.0
# Après un téléchargement du JWKS en échec, pause avant le prochain essai.
_JWKS_RETRY_AFTER_FAILURE_SEC = 30.0
_JWKS_HTTP_TIMEOUT_SEC = 5.0

# Horloge monotone injectable (tests) pour les caches de ce module.
_monotonic = time.monotonic


class _TokenRejected(Exception):
    """Refus définitif : inutile de demander à Supabase, il refuserait aussi."""


class _TokenUnverifiable(Exception):
    """Impossible de conclure localement : repli sur Supabase Auth."""


class _HsSignatureMismatch(_TokenUnverifiable):
    """Signature HS256 fausse avec NOTRE secret : jeton forgé, ou secret du
    serveur qui ne correspond pas au projet Supabase. Impossible de trancher
    localement : c'est Supabase Auth qui décide."""


class _JwksUnavailable(Exception):
    """JWKS injoignable (échec tout récent, nouvel essai plus tard)."""


def jwks_url_for(supabase_url: str | None) -> str | None:
    base = (supabase_url or "").strip().rstrip("/")
    if not base:
        return None
    return f"{base}/auth/v1/.well-known/jwks.json"


async def _fetch_jwks(url: str) -> dict[str, Any]:
    """Télécharge le JWKS public du projet (aucune clé secrète envoyée)."""
    async with httpx.AsyncClient(timeout=_JWKS_HTTP_TIMEOUT_SEC) as client:
        res = await client.get(url, headers={"Accept": "application/json"})
    res.raise_for_status()
    data = res.json()
    if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
        raise ValueError("JWKS mal formé : liste « keys » absente")
    return data


class _JwksCache:
    """Cache du JWKS avec durée de vie et rechargement sur `kid` inconnu.

    Constaté le 2026-10-01 (relecture) : quand le JWKS ne répondait plus après
    l'expiration du cache, CHAQUE requête retentait le téléchargement, l'une
    après l'autre sous le verrou (5 requêtes simultanées = 5 téléchargements,
    2,5 s ; avec le vrai délai de 5 s, la 5e attendait ~25 s). Désormais un
    échec ouvre une pause de 30 s : les requêtes qui attendaient le verrou
    profitent de l'échec sans retenter, et pendant la pause on sert les clés en
    cache (ou on passe directement au repli s'il n'y en a aucune).
    """

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.url: str | None = None
        self.keys: list[dict[str, Any]] = []
        self.fetched_at: float | None = None
        self.last_forced_reload: float | None = None
        self.last_failure_at: float | None = None
        self.retry_not_before: float | None = None
        self._lock = asyncio.Lock()

    def _switch_url(self, url: str) -> None:
        self.url = url
        self.keys, self.fetched_at, self.last_forced_reload = [], None, None
        self.last_failure_at, self.retry_not_before = None, None

    def _in_failure_pause(self, now: float) -> bool:
        return self.retry_not_before is not None and now < self.retry_not_before

    async def _refresh(self, url: str, skip_if_fetched_since: float | None = None) -> None:
        async with self._lock:
            if skip_if_fetched_since is not None and self.url == url:
                # Plusieurs requêtes simultanées sur un cache périmé : une seule
                # télécharge, les autres profitent du résultat obtenu pendant
                # qu'elles attendaient le verrou…
                if self.fetched_at is not None and self.fetched_at >= skip_if_fetched_since:
                    return
                # … y compris d'un ÉCHEC : inutile de retenter aussitôt.
                if self.last_failure_at is not None and self.last_failure_at >= skip_if_fetched_since:
                    raise _JwksUnavailable("échec tout récent du téléchargement")
            try:
                data = await _fetch_jwks(url)
            except Exception as exc:
                self.last_failure_at = _monotonic()
                self.retry_not_before = self.last_failure_at + _JWKS_RETRY_AFTER_FAILURE_SEC
                logger.warning(
                    "Téléchargement du JWKS en échec (%s) ; nouvel essai au plus tôt dans %d s",
                    type(exc).__name__,
                    int(_JWKS_RETRY_AFTER_FAILURE_SEC),
                )
                raise
            self.keys = [k for k in data["keys"] if isinstance(k, dict)]
            self.url = url
            self.fetched_at = _monotonic()
            self.last_failure_at, self.retry_not_before = None, None

    @staticmethod
    def _matches(key: dict[str, Any], alg: str) -> bool:
        if key.get("kty") != _ASYMMETRIC_ALGS[alg]:
            return False
        if key.get("alg") not in (None, alg):
            return False
        return key.get("use") in (None, "sig")

    def _find(self, kid: str | None, alg: str) -> dict[str, Any] | None:
        candidates = [k for k in self.keys if self._matches(k, alg)]
        if kid:
            return next((k for k in candidates if k.get("kid") == kid), None)
        # Sans `kid`, on n'accepte que s'il n'y a aucune ambiguïté.
        return candidates[0] if len(candidates) == 1 else None

    async def get_key(self, url: str, kid: str | None, alg: str) -> dict[str, Any] | None:
        now = _monotonic()
        if url != self.url:
            self._switch_url(url)
        just_downloaded = False
        if self.fetched_at is None or (now - self.fetched_at) > _JWKS_TTL_SEC:
            if self._in_failure_pause(now):
                # Échec il y a moins de 30 s : pas de nouvel essai (et pas
                # d'attente de 5 s par requête). Sans clé en cache, on passe
                # directement au repli Supabase Auth.
                if not self.keys:
                    raise _JwksUnavailable("JWKS injoignable, nouvel essai plus tard")
            else:
                try:
                    await self._refresh(url, skip_if_fetched_since=now)
                    just_downloaded = True
                except Exception:
                    if not self.keys:
                        raise
                    # JWKS momentanément injoignable : les clés déjà connues
                    # restent valables (une clé publique ne devient pas fausse
                    # en 10 min). Le journal est écrit par _refresh, une fois
                    # par échec réel et non une fois par requête.
        key = self._find(kid, alg)
        if key is not None or just_downloaded:
            return key
        if self._in_failure_pause(_monotonic()):
            return None
        # `kid` inconnu d'un cache encore valide : la clé a peut-être tourné côté
        # Supabase. On recharge, mais pas plus d'une fois toutes les 30 s : sinon
        # un jeton au `kid` fantaisiste déclencherait un appel réseau par requête.
        last = self.last_forced_reload
        if last is None or (now - last) >= _JWKS_FORCED_RELOAD_MIN_INTERVAL_SEC:
            self.last_forced_reload = now
            await self._refresh(url)
            return self._find(kid, alg)
        return None


_jwks_cache = _JwksCache()


async def _verify_locally(token: str, settings: Settings) -> dict[str, Any]:
    """Vérifie signature, audience et expiration. Renvoie les revendications."""
    try:
        header = jwt.get_unverified_header(token)
    except JOSEError as exc:
        raise _TokenRejected("en-tête illisible") from exc
    if not isinstance(header, dict):
        raise _TokenRejected("en-tête illisible")
    alg = header.get("alg")
    kid = header.get("kid")
    # Constaté le 2026-10-01 (relecture) : un en-tête forgé {"alg": ["ES256"]}
    # faisait planter `alg in _ASYMMETRIC_ALGS` (TypeError : une liste ne peut
    # pas servir de clé de dictionnaire) → erreur 500 au lieu de 401. L'en-tête
    # est fourni par l'appelant : on vérifie son type avant de s'en servir.
    if not isinstance(alg, str):
        raise _TokenRejected(f"champ « alg » invalide ({type(alg).__name__})")
    if kid is not None and not isinstance(kid, str):
        raise _TokenRejected(f"champ « kid » invalide ({type(kid).__name__})")

    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise _TokenUnverifiable("SUPABASE_JWT_SECRET absent pour un jeton HS256")
        key: Any = settings.supabase_jwt_secret
    elif alg in _ASYMMETRIC_ALGS:
        url = jwks_url_for(settings.supabase_url)
        if not url:
            raise _TokenUnverifiable("SUPABASE_URL absente : JWKS introuvable")
        try:
            key = await _jwks_cache.get_key(url, kid, alg)
        except Exception as exc:
            raise _TokenUnverifiable(f"JWKS injoignable ({type(exc).__name__})") from exc
        if key is None:
            raise _TokenUnverifiable(f"clé {kid!r} absente du JWKS")
    else:
        raise _TokenRejected(f"algorithme refusé : {alg!r}")

    # 1) Signature seule, vérifiée À PART des revendications, pour savoir QUI
    #    est en cause quand elle est fausse.
    #
    # Constaté le 2026-10-01 (relecture) : toute signature HS256 fausse était un
    # refus définitif, sans repli. Or l'ancien code retombait sur Supabase Auth
    # dans require_user_or_admin et require_paid_user_or_admin. Si le projet
    # signe encore en HS256 (clé ES256 seulement « en attente ») et que
    # SUPABASE_JWT_SECRET du serveur est périmé ou vient d'un autre projet, le
    # redéploiement aurait répondu 401 à TOUS les abonnés. Une signature HS256
    # fausse ne permet pas de distinguer « jeton forgé » de « secret du serveur
    # faux » : on laisse Supabase Auth trancher (coût borné par le cache des
    # refus, voir _verify_with_supabase_auth).
    # Une signature ES256/RS256 fausse reste un refus définitif : la clé
    # publique vient du JWKS de Supabase lui-même.
    try:
        jws.verify(token, key, algorithms=[alg])
    except JOSEError as exc:
        if alg == "HS256":
            raise _HsSignatureMismatch("signature HS256 non conforme à SUPABASE_JWT_SECRET") from exc
        raise _TokenRejected(f"signature {alg} invalide") from exc

    # 2) Revendications (signature revérifiée au passage : on ne désactive
    #    jamais ce contrôle). Ici, tout échec est un refus définitif.
    #    Constaté le 2026-10-01 (relecture) : sans « require_aud », python-jose
    #    acceptait un jeton SANS audience (seule une audience présente et fausse
    #    était refusée), contrairement à ce qu'annonçait ce commentaire.
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=_SUPABASE_AUDIENCE,
            options={"require_exp": True, "verify_exp": True, "require_aud": True},
        )
    except JOSEError as exc:
        # Jeton expiré, audience absente ou incorrecte, exp absente…
        raise _TokenRejected(type(exc).__name__) from exc

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise _TokenRejected("revendication « sub » absente")
    return payload


# ---------------------------------------------------------------------------
# Cache des refus de Supabase Auth.
#
# Le repli /auth/v1/user est un appel réseau. Un jeton que Supabase a refusé ne
# deviendra pas valable : on retient ce refus 60 s pour qu'un même jeton forgé,
# renvoyé en boucle, ne déclenche pas un appel réseau par requête. On ne retient
# QUE les vrais refus (réponse 4xx de Supabase, hors 429) : une panne réseau ou
# un 5xx ne doit pas bloquer un jeton valable plus longtemps que la panne.
# On stocke l'empreinte SHA-256 du jeton, jamais le jeton lui-même.
# ---------------------------------------------------------------------------
_AUTH_REFUSAL_TTL_SEC = 60.0
_AUTH_REFUSAL_MAX_KEYS = 5000
_auth_refusals: dict[str, float] = {}


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _recently_refused_by_supabase(token: str) -> bool:
    fingerprint = _token_fingerprint(token)
    expires_at = _auth_refusals.get(fingerprint)
    if expires_at is None:
        return False
    if _monotonic() < expires_at:
        return True
    _auth_refusals.pop(fingerprint, None)
    return False


def _remember_supabase_refusal(token: str) -> None:
    fingerprint = _token_fingerprint(token)
    _auth_refusals.pop(fingerprint, None)
    _auth_refusals[fingerprint] = _monotonic() + _AUTH_REFUSAL_TTL_SEC
    while len(_auth_refusals) > _AUTH_REFUSAL_MAX_KEYS:
        _auth_refusals.pop(next(iter(_auth_refusals)))


async def _verify_with_supabase_auth(token: str, settings: Settings) -> str | None:
    """Dernier recours : demander à Supabase Auth si le jeton est valide."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    auth_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    auth_headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {token}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            auth_res = await client.get(auth_url, headers=auth_headers)
        if 200 <= auth_res.status_code < 300:
            uid = auth_res.json().get("id")
            if isinstance(uid, str) and uid:
                return uid
        elif 400 <= auth_res.status_code < 500 and auth_res.status_code != 429:
            _remember_supabase_refusal(token)
    except Exception as exc:
        logger.warning("Repli Supabase Auth en échec : %s", type(exc).__name__)
    return None


# Journal « secret HS256 faux » : au plus une fois toutes les 10 min, pour ne
# pas noyer les journaux si toutes les requêtes sont concernées.
_SECRET_MISMATCH_LOG_EVERY_SEC = 600.0
_last_secret_mismatch_log: float | None = None


def _log_jwt_secret_mismatch() -> None:
    global _last_secret_mismatch_log
    now = _monotonic()
    if _last_secret_mismatch_log is not None and (now - _last_secret_mismatch_log) < _SECRET_MISMATCH_LOG_EVERY_SEC:
        return
    _last_secret_mismatch_log = now
    logger.error(
        "SUPABASE_JWT_SECRET ne correspond pas au projet Supabase : un jeton HS256 "
        "refusé avec ce secret vient d'être accepté par Supabase Auth. Corrigez "
        "SUPABASE_JWT_SECRET dans le .env du serveur (Supabase > Project Settings > "
        "API > JWT Secret). En attendant, chaque requête passe par un appel réseau "
        "à Supabase Auth (plus lent)."
    )


async def verify_supabase_token(token: str, settings: Settings) -> str:
    """Renvoie l'identifiant utilisateur (sub) du jeton, ou lève une 401."""
    hs_signature_mismatch = False
    try:
        payload = await _verify_locally(token, settings)
        return payload["sub"]
    except _TokenRejected as exc:
        logger.debug("Jeton refusé : %s", exc)
        raise HTTPException(status_code=401, detail="Token invalide")
    except _HsSignatureMismatch as exc:
        # Pas d'avertissement ici : un jeton forgé ne mérite qu'une ligne de
        # débogage. Le vrai problème (secret faux) est journalisé plus bas, une
        # fois PROUVÉ par l'acceptation de Supabase Auth.
        hs_signature_mismatch = True
        logger.debug("Jeton HS256 non vérifiable avec notre secret (%s) : repli sur Supabase Auth", exc)
    except _TokenUnverifiable as exc:
        logger.warning("Jeton non vérifiable localement (%s) : repli sur Supabase Auth", exc)

    if _recently_refused_by_supabase(token):
        raise HTTPException(status_code=401, detail="Token invalide")
    uid = await _verify_with_supabase_auth(token, settings)
    if uid:
        if hs_signature_mismatch:
            _log_jwt_secret_mismatch()
        return uid
    raise HTTPException(status_code=401, detail="Token invalide")


def _admin_token_ok(x_admin_token: str | None, settings: Settings) -> bool:
    if not x_admin_token or not settings.admin_token:
        return False
    return hmac.compare_digest(x_admin_token.encode(), settings.admin_token.encode())


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> UUID:
    """Vérifie le jeton Supabase et renvoie l'identifiant utilisateur."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token manquant")
    sub = await verify_supabase_token(credentials.credentials, settings)
    try:
        return UUID(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token invalide")


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
            await verify_supabase_token(credentials.credentials, settings)
            return True
        except HTTPException:
            pass

    if _admin_token_ok(x_admin_token, settings):
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
    if _admin_token_ok(x_admin_token, settings):
        return True

    # JWT utilisateur requis
    if not credentials:
        raise HTTPException(status_code=401, detail="Token utilisateur requis")

    # Vérification locale (HS256 / ES256 / RS256), repli Supabase Auth en dernier
    # recours — lève 401 « Token invalide » si le jeton n'est pas valable.
    user_id = await verify_supabase_token(credentials.credentials, settings)

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
    # MG-M06 — On interroge la source d'autorite PARTAGEE plutot que la table
    # `pro_clients` en direct. La requete directe ignorait deux regles que la
    # base applique deja :
    #   - l'heritage d'organisation (un membre beneficie de l'abonnement du
    #     proprietaire, sans ligne `pro_clients` a son nom) -> faux refus;
    #   - l'expiration (`subscription_end`), jamais testee ici -> faux acces
    #     pour un abonnement termine mais reste en statut 'active'.
    # Deux sources de verite donnaient deux reponses ; il n'y en a plus qu'une.
    url = f"{base}/rest/v1/rpc/get_effective_subscription_for"

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    # -----------------------------------------------------------------------
    # Constaté le 2026-10-01 : un échec de la RPC (404 si elle n'est pas
    # déployée, 5xx, réponse illisible) était traité comme un REFUS
    # d'abonnement : 403 « Abonnement payant requis », mis en cache 60 s. Un
    # abonné en règle se voyait donc accusé de ne pas payer pendant une panne
    # de la plateforme (le front affiche alors « votre formule n'inclut pas
    # cette fonction »). Règle désormais :
    #   - SEULE une réponse valide (une ligne avec is_active booléen) tranche :
    #     is_active=false ou palier sans radar → 403, mis en cache 60 s ;
    #   - tout le reste (réseau, statut non 2xx, JSON illisible, ligne absente
    #     ou mal formée) → 503 avec un message clair, JAMAIS mis en cache :
    #     la requête suivante revérifie dès que la plateforme répond.
    # -----------------------------------------------------------------------
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, headers=headers, json={"p_user_id": user_id})
    except httpx.HTTPError as e:
        logger.error("Paid check Supabase request failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=_SUBSCRIPTION_CHECK_UNAVAILABLE)

    if res.status_code < 200 or res.status_code >= 300:
        body = res.text[:2000]
        logger.error("Paid check Supabase bad status %s: %s", res.status_code, body)
        raise HTTPException(status_code=503, detail=_SUBSCRIPTION_CHECK_UNAVAILABLE)

    try:
        rows = res.json()
    except Exception:
        rows = None

    # La RPC renvoie TOUJOURS exactement une ligne : is_active tranche.
    valid_row = None
    if isinstance(rows, list) and rows:
        row = rows[0]
    elif isinstance(rows, dict):
        row = rows
    else:
        row = None

    if not isinstance(row, dict) or not isinstance(row.get("is_active"), bool):
        # Réponse 2xx mais inexploitable : la RPC définie dans
        # supabase/migrations/20260718170000_p7i_effective_subscription_for.sql
        # renvoie toujours une ligne avec is_active non nul. Autre chose = panne
        # ou mauvaise version de la fonction, pas un défaut d'abonnement.
        logger.error(
            "Paid check Supabase réponse inexploitable (type=%s)",
            type(rows).__name__,
        )
        raise HTTPException(status_code=503, detail=_SUBSCRIPTION_CHECK_UNAVAILABLE)

    if row.get("is_active") is True:
        c_type = row.get("subscription_type")
        # Le niveau de formule reste filtre cote service : toutes les formules
        # actives n'ouvrent pas forcement le Monitor.
        if isinstance(c_type, str) and _PAID_SUBSCRIPTION_TYPES.issuperset({c_type.lower()}):
            valid_row = row

    # Journal : la formule RÉELLEMENT renvoyée (avant, on lisait valid_row, vide
    # justement en cas de refus : le journal affichait toujours None).
    sub_type = row.get("subscription_type") if isinstance(row, dict) else None
    sub_status = row.get("subscription_status") if isinstance(row, dict) else None
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
