from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.ai_rate_limit import ai_widget_user
from app.config import Settings, get_settings
from app.llm.client import get_llm_client, llm_is_simulated

router = APIRouter(prefix="/ai/widgets", tags=["ai-widgets"])

_payload_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_payload_lock = threading.Lock()
_PAYLOAD_CACHE_MAX_KEYS = 4000

# ---------------------------------------------------------------------------
# CONTRAT PARTAGÉ AVEC LE FRONT (2026-10-01) — points (a) et (b).
#
# Constaté le 2026-10-01 : ces widgets renvoyaient des chiffres écrits en dur
# ou fabriqués, présentés comme une analyse :
#   - benchmark : moyenne secteur 65 000, top 25 % 85 000 (constantes), et
#     « votre performance » = nombre d'annonces × 15 000 ;
#   - prévisions : ventes = annonces × 15 000, prévision +12 %, confiance 0,78,
#     taux de conversion 12 % → 14 % (constantes) ;
#   - ROI 0,6 / 0,35 / 0,25 des recommandations, confiances 0,99 / 0,92 / 0,88
#     des constats, impacts « 20-30 % » et « 10-15 % » identiques pour tous ;
#   - « createdAt » valait le texte "now" (date illisible côté front).
# Le radar ne reçoit ni les ventes réalisées, ni les vues, ni les demandes de
# contact du vendeur : aucun de ces chiffres ne peut être calculé.
#
# Règles désormais (mêmes clés qu'avant, valeurs nullables) :
#   (b) un chiffre qui ne peut pas être calculé à partir de données réelles
#       vaut null, et l'objet porte un champ « raison » (texte court). Seuls
#       restent des COMPTES réels faits sur les annonces du vendeur (table
#       machines) : annonces, annonces sans photo, titres incomplets,
#       descriptions courtes. Le LLM (vraie clé) peut reformuler les textes,
#       mais tout nombre qu'il proposerait dans un champ est remis à null, et
#       une liste dont un texte cite un autre chiffre que ces comptes revient
#       aux règles (REV-1, plus bas) : il ne reçoit que ces comptes, il ne peut
#       rien chiffrer d'autre.
#   Une panne de lecture des annonces donne 503, jamais « zéro annonce » (REV-4).
#   (a) chaque objet renvoyé porte « simulated » : true quand aucune vraie IA
#       n'est configurée sur le radar (le client simulé n'est alors même pas
#       appelé : le contenu vient des règles ci-dessous) ; false sinon.
#       Les routes qui renvoient une liste portent le champ sur CHAQUE élément.
#       « origine » précise d'où vient le texte : « ia » ou « regles » (règles
#       sur les annonces, y compris en repli quand l'IA ne répond pas ou que sa
#       réponse n'est pas conforme). Le front doit lire « origine » : avec une
#       vraie clé en panne, simulated=false mais origine="regles" — aucune IA
#       n'a produit ce texte (relecture REV-3, à afficher côté front).
# ---------------------------------------------------------------------------

_RAISON_VENTES = (
    "Le radar ne reçoit pas vos ventes réalisées (montants, dates) : ni valeur "
    "actuelle ni prévision ne peuvent être calculées."
)
_RAISON_CONVERSION = (
    "Le radar ne reçoit ni vos demandes de contact ni vos ventes : aucun taux "
    "de conversion ne peut être calculé."
)
_RAISON_ROI = "Aucune mesure du retour sur investissement n'est disponible sur le radar."
_RAISON_CONFIANCE = (
    "Constat compté directement sur vos annonces : aucun indice de confiance "
    "n'est calculé."
)
_RAISON_IMPACT = (
    "Impact non chiffrable : le radar ne reçoit ni les vues ni les demandes de "
    "contact de vos annonces."
)
_RAISON_BENCHMARK = (
    "Le radar ne dispose ni de chiffres de ventes du secteur ni de vos ventes "
    "réalisées : aucune comparaison chiffrée n'est possible."
)

# Seuil de la règle « description trop courte » (choix de règle explicite,
# affiché dans le texte du conseil, pas une mesure).
_DESCRIPTION_MIN_CHARS = 80

_LIST_KEYS = ("insights", "recommendations", "predictions", "optimizations")

# Champs chiffrés que le LLM ne peut pas calculer (il ne reçoit que les comptes
# d'annonces) : toute valeur qu'il y mettrait est inventée → null + raison.
_LLM_UNCOMPUTABLE_FIELDS: dict[str, tuple[tuple[str, ...], str]] = {
    "insights": (("confidence",), _RAISON_CONFIANCE),
    "recommendations": (("roi",), _RAISON_ROI),
    "optimizations": (("expectedImpact",), _RAISON_IMPACT),
}

# ---------------------------------------------------------------------------
# Constaté le 2026-10-01 (relecture, REV-1) : seuls les nombres de type
# int/float du LLM étaient remis à null. Les chiffres écrits EN TEXTE passaient
# intacts — « ROI attendu 60 %, +20-30 % de contacts » dans une description,
# « confidence »: « 92 % » ou « expectedImpact »: « +25 % » sous des clés que le
# radar ne connaissait pas, « priority » 0,9 sur un constat — servis avec
# origine="ia" et affichés par le front sous « Source : serveur ».
# Désormais, pour chaque élément proposé par le LLM :
#   - LISTE BLANCHE de clés par liste : toute autre clé est retirée ;
#   - énumérations contrôlées (type, priorité, impact, effort, catégorie) et
#     identifiants en lettres seules : valeur hors liste → élément non conforme ;
#   - textes affichés (title, description, action, actions[]) : un chiffre n'y
#     est admis que s'il est l'un des COMPTES RÉELS envoyés au LLM (annonces,
#     sans photo, titres incomplets, descriptions courtes), écrit tel quel —
#     ni signe, ni %, ni unité (« +3 », « 3 % », « 3 fois », « 3 jours »).
#     « pour cent » et « % » sont refusés partout.
# Un seul élément non conforme et TOUTE la liste revient aux règles du radar :
# un LLM qui invente un chiffre n'est pas cru sur le reste de la liste, et les
# règles portent les comptes réels (rien n'est perdu).
# ---------------------------------------------------------------------------
_LLM_ENUMS: dict[str, dict[str, frozenset[str]]] = {
    "insights": {
        "type": frozenset({"recommendation", "alert", "prediction", "optimization"}),
        "priority": frozenset({"low", "medium", "high", "critical"}),
    },
    "recommendations": {
        "category": frozenset({"sales", "inventory", "performance", "marketing", "content"}),
        "impact": frozenset({"low", "medium", "high"}),
        "effort": frozenset({"low", "medium", "high"}),
    },
    "optimizations": {},
}
# Textes affichés tels quels par le front : contrôlés chiffre par chiffre.
_LLM_TEXT_FIELDS: dict[str, tuple[str, ...]] = {
    "insights": ("title", "description", "action"),
    "recommendations": ("title", "description"),
    "optimizations": ("title", "description"),
}
_LLM_TEXT_LIST_FIELDS: dict[str, tuple[str, ...]] = {
    "insights": (),
    "recommendations": ("actions",),
    "optimizations": ("actions",),
}
# Identifiants libres mais SANS chiffre (ex. « seo_optimization »).
_LLM_CODE_FIELDS: dict[str, tuple[str, ...]] = {
    "insights": (),
    "recommendations": (),
    "optimizations": ("type",),
}
_CODE_RE = re.compile(r"^[a-z][a-z_]{0,59}$")
_NOMBRE_RE = re.compile(r"\d+(?:[.,]\d+)*")
_POURCENT_RE = re.compile(r"%|‰|pour\s*cent|pourcent", re.IGNORECASE)
# Unité ou devise juste après un compte réel : le compte est détourné en chiffre
# inventé (« 3 fois plus », « 3 jours », « 3 MAD », « 3 k »).
_UNITE_APRES_RE = re.compile(
    r"\s*(?:[€$£]|(?:mad|dh|dhs|dirhams?|usd|eur|euros?|k|m|md|mds|millions?|"
    r"milliards?|pts?|points?|fois|x|h|heures?|j|jours?|semaines?|mois|ans?|"
    r"années?|min|minutes?)\b)",
    re.IGNORECASE,
)


def _chiffre_hors_comptes(texte: str, comptes: set[int]) -> bool:
    """True si `texte` contient un chiffre qui n'est pas un compte réel cité tel quel."""
    if _POURCENT_RE.search(texte):
        return True
    for m in _NOMBRE_RE.finditer(texte):
        token = m.group(0)
        if not token.isdigit() or (len(token) > 1 and token.startswith("0")):
            return True  # décimal (« 0,9 »), séparateur (« 52.000 »), « 000 » de « 52 000 »
        if int(token) not in comptes:
            return True
        avant = texte[m.start() - 1] if m.start() > 0 else ""
        apres = texte[m.end()] if m.end() < len(texte) else ""
        if (avant and avant in "+-−±×") or avant.isalpha() or apres.isalpha():
            return True  # « +3 », « J+1 », « x3 », « 2h », « 10k »
        if _UNITE_APRES_RE.match(texte, m.end()):
            return True
    return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _has_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _listing_stats(machines: list[dict[str, Any]]) -> dict[str, int]:
    """Comptes RÉELS sur les annonces du vendeur — les seuls chiffres servis."""
    machine_count = len(machines)
    with_images = sum(
        1
        for m in machines
        if (isinstance(m.get("images"), list) and len(m.get("images") or []) > 0)
        or (isinstance(m.get("photos"), list) and len(m.get("photos") or []) > 0)
    )
    incomplete_titles = sum(
        1
        for m in machines
        if not (_has_text(m.get("brand")) and _has_text(m.get("model")) and m.get("year"))
    )
    short_descriptions = sum(
        1
        for m in machines
        if len(str(m.get("description") or "").strip()) < _DESCRIPTION_MIN_CHARS
    )
    return {
        "machine_count": machine_count,
        "with_images": with_images,
        "incomplete_titles": incomplete_titles,
        "short_descriptions": short_descriptions,
    }


def _default_predictions() -> list[dict[str, Any]]:
    # Aucun historique de ventes, de vues ni de contacts n'arrive au radar :
    # valeurs, prévisions, confiance et tendance sont NON DISPONIBLES (null).
    return [
        {
            "metric": "Ventes mensuelles",
            "currentValue": None,
            "predictedValue": None,
            "confidence": None,
            "timeframe": "30d",
            "trend": None,
            "factors": [
                "qualite des annonces",
                "reponse aux prospects",
                "saisonnalite",
            ],
            "raison": _RAISON_VENTES,
        },
        {
            "metric": "Taux de conversion",
            "currentValue": None,
            "predictedValue": None,
            "confidence": None,
            "timeframe": "30d",
            "trend": None,
            "factors": [
                "prix",
                "photos",
                "completude des descriptions",
            ],
            "raison": _RAISON_CONVERSION,
        },
    ]


def _default_recommendations(machine_count: int, with_images: int) -> list[dict[str, Any]]:
    recs: list[dict[str, Any]] = []
    if machine_count == 0:
        recs.append(
            {
                "id": "create_listings",
                "category": "marketing",
                "title": "Creer vos premieres annonces",
                "description": "Aucune annonce active n'a ete detectee.",
                "impact": "high",
                "effort": "low",
                "roi": None,
                "raison": _RAISON_ROI,
                "actions": [
                    "Publier au moins 5 annonces",
                    "Ajouter des photos HD",
                    "Completer specs et localisation",
                ],
                "priority": 1,
            }
        )
    else:
        if with_images < machine_count:
            recs.append(
                {
                    "id": "images_quality",
                    "category": "content",
                    "title": "Ameliorer les visuels des annonces",
                    "description": f"{machine_count - with_images} annonce(s) sans images detectees.",
                    "impact": "high",
                    "effort": "low",
                    "roi": None,
                    "raison": _RAISON_ROI,
                    "actions": [
                        "Ajouter 4-8 photos par machine",
                        "Utiliser des images nettes et recentes",
                        "Prioriser les vues exterieure/interieure",
                    ],
                    "priority": 2,
                }
            )
        recs.append(
            {
                "id": "follow_up",
                "category": "sales",
                "title": "Structurer le suivi commercial",
                "description": "Mettre en place des relances standardisees pour augmenter les conversions.",
                "impact": "medium",
                "effort": "low",
                "roi": None,
                "raison": _RAISON_ROI,
                "actions": [
                    "Repondre en moins de 2h",
                    "Relancer a J+1 et J+3",
                    "Proposer une offre personnalisee",
                ],
                "priority": 3,
            }
        )
    return recs


def _default_insights(machine_count: int, with_images: int, created_at: str) -> list[dict[str, Any]]:
    insights: list[dict[str, Any]] = []
    if machine_count == 0:
        insights.append(
            {
                "id": "no_inventory",
                "type": "alert",
                "title": "Aucune annonce active",
                "description": "Le compte client ne contient aucune machine au statut disponible.",
                "confidence": None,
                "raison": _RAISON_CONFIANCE,
                "priority": "critical",
                "action": "Publier des annonces pour activer les analyses IA",
                "createdAt": created_at,
            }
        )
    else:
        insights.append(
            {
                "id": "inventory_detected",
                "type": "recommendation",
                "title": "Inventaire detecte",
                "description": f"{machine_count} machine(s) disponible(s) reliee(s) au compte client.",
                "confidence": None,
                "raison": _RAISON_CONFIANCE,
                "priority": "medium",
                "action": "Prioriser les machines a forte valeur",
                "createdAt": created_at,
            }
        )
        if with_images < machine_count:
            insights.append(
                {
                    "id": "missing_images",
                    "type": "alert",
                    "title": "Qualite des annonces a renforcer",
                    "description": f"{machine_count - with_images} annonce(s) manquent d'images.",
                    "confidence": None,
                    "raison": _RAISON_CONFIANCE,
                    "priority": "high",
                    "action": "Ajouter des images pour augmenter la conversion",
                    "createdAt": created_at,
                }
            )
    return insights


def _default_optimizations(stats: dict[str, int]) -> list[dict[str, Any]]:
    total = stats["machine_count"]
    if total:
        titres = (
            f" {stats['incomplete_titles']} annonce(s) sur {total} sans marque, "
            "modèle ou année renseignés."
        )
        descriptions = (
            f" {stats['short_descriptions']} annonce(s) sur {total} sans description "
            f"ou avec moins de {_DESCRIPTION_MIN_CHARS} caractères."
        )
    else:
        titres = descriptions = " Aucune annonce reliée au compte pour l'instant."
    return [
        {
            "type": "seo_optimization",
            "title": "Optimiser les titres d'annonces",
            "description": "Ameliorer la visibilite en adaptant les titres aux recherches frequentes." + titres,
            "actions": [
                "Ajouter marque + modele + annee",
                "Inclure l'etat et la localisation",
                "Eviter les titres trop courts",
            ],
            "expectedImpact": None,
            "raison": _RAISON_IMPACT,
        },
        {
            "type": "content_optimization",
            "title": "Ameliorer les descriptions techniques",
            "description": "Les annonces detaillees convertissent mieux." + descriptions,
            "actions": [
                "Renseigner heures, etat, accessoires",
                "Ajouter points forts et maintenance",
                "Preciser disponibilite et delai",
            ],
            "expectedImpact": None,
            "raison": _RAISON_IMPACT,
        },
    ]


# ---------------------------------------------------------------------------
# Constaté le 2026-10-01 (relecture, REV-4) : toute réponse non 2xx de
# Supabase valait « liste vide ». Clé service_role révoquée (401), quota (429)
# ou panne (5xx) : un vendeur aux 40 annonces lisait « Aucune annonce active »
# (priorité critical) et « Créer vos premières annonces » — un zéro fabriqué à
# partir d'une panne. Désormais :
#   - seuls 400 (colonne inexistante, code 42703) et 404 font essayer la
#     colonne de propriétaire suivante ;
#   - tout autre statut, une erreur réseau, un corps illisible, ou aucune
#     colonne reconnue → 503 « annonces illisibles », jamais [] ;
#   - seules les machines au statut « available » (ou sans colonne status)
#     sont comptées : les textes parlent d'annonces actives, une machine vendue
#     ou réservée n'en est pas une (contrainte machines_status_check :
#     available | sold | reserved).
# ---------------------------------------------------------------------------
_ANNONCES_ILLISIBLES = (
    "Vos annonces sont illisibles pour le moment (service de la plateforme "
    "indisponible) : aucune analyse n'est produite. Réessayez dans quelques minutes."
)
_STATUTS_COLONNE_SUIVANTE = (400, 404)


def _annonce_active(machine: dict[str, Any]) -> bool:
    status = machine.get("status")
    return status in (None, "") or (isinstance(status, str) and status.strip().lower() == "available")


async def _fetch_user_machines(settings: Settings, user_id: str) -> list[dict[str, Any]]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase non configure")

    base = settings.supabase_url.rstrip("/")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Accept": "application/json",
    }
    columns = ["sellerid", "seller_id", "user_id", "owner_id"]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for col in columns:
                url = f"{base}/rest/v1/machines?select=*&{col}=eq.{user_id}&limit=500"
                res = await client.get(url, headers=headers)
                if 200 <= res.status_code < 300:
                    try:
                        data = res.json()
                    except ValueError:
                        data = None
                    if not isinstance(data, list):
                        raise HTTPException(status_code=503, detail=_ANNONCES_ILLISIBLES)
                    return [m for m in data if isinstance(m, dict) and _annonce_active(m)]
                if res.status_code in _STATUTS_COLONNE_SUIVANTE:
                    continue  # colonne inexistante ou table absente : colonne suivante
                # 401/403/429/5xx… : panne de la plateforme, pas « zéro annonce ».
                raise HTTPException(status_code=503, detail=_ANNONCES_ILLISIBLES)
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail=_ANNONCES_ILLISIBLES)
    # Aucune colonne de propriétaire reconnue : schéma inattendu, pas « zéro annonce ».
    raise HTTPException(status_code=503, detail=_ANNONCES_ILLISIBLES)


def _with_origin(items: list[dict[str, Any]], origine: str) -> list[dict[str, Any]]:
    return [dict(it, origine=it.get("origine") or origine) for it in items if isinstance(it, dict)]


def _comptes_reels(stats: dict[str, int]) -> set[int]:
    """Les seuls nombres qu'un texte du LLM peut citer : les comptes qu'il a reçus."""
    comptes = {int(v) for v in stats.values()}
    comptes.add(stats["machine_count"] - stats["with_images"])  # annonces sans photo
    return comptes


def _llm_item_conforme(
    key: str, item: Any, position: int, comptes: set[int]
) -> dict[str, Any] | None:
    """Élément du LLM réduit à sa liste blanche, ou None s'il n'est pas conforme.

    Voir REV-1 plus haut : clés inconnues retirées, énumérations contrôlées,
    aucun chiffre hors des comptes réels dans les textes affichés, aucun nombre
    de son cru (le rang « priority » d'une recommandation n'est qu'un ordre :
    hors 1..99, il devient la position dans la liste).
    """
    if not isinstance(item, dict):
        return None
    out: dict[str, Any] = {}

    title = item.get("title")
    if not isinstance(title, str) or not title.strip():
        return None
    for champ in _LLM_TEXT_FIELDS[key]:
        valeur = item.get(champ)
        if valeur is None:
            continue
        if not isinstance(valeur, str) or _chiffre_hors_comptes(valeur, comptes):
            return None
        out[champ] = valeur
    for champ in _LLM_TEXT_LIST_FIELDS[key]:
        valeurs = item.get(champ)
        if valeurs is None:
            continue
        if not isinstance(valeurs, list):
            return None
        textes = [v for v in valeurs if isinstance(v, str)]
        if any(_chiffre_hors_comptes(v, comptes) for v in textes):
            return None
        out[champ] = textes
    for champ, permis in _LLM_ENUMS[key].items():
        valeur = item.get(champ)
        if not isinstance(valeur, str) or valeur not in permis:
            return None  # ex. « priority » 0,9 sur un constat, « impact » « +25 % »
        out[champ] = valeur
    for champ in _LLM_CODE_FIELDS[key]:
        valeur = item.get(champ)
        if not isinstance(valeur, str) or not _CODE_RE.match(valeur):
            return None
        out[champ] = valeur

    ident = item.get("id")
    # Identifiant sans chiffre (il ne doit rien chiffrer non plus) ; sinon posé par le radar.
    out["id"] = ident if isinstance(ident, str) and _CODE_RE.match(ident) else f"ia_{key}_{chr(97 + position)}"
    if key == "recommendations":
        rang = item.get("priority")
        valide = isinstance(rang, int) and not isinstance(rang, bool) and 1 <= rang <= 99
        out["priority"] = rang if valide else position + 1
    return out


def _merge_llm_payload(
    parsed: Any,
    defaults: dict[str, Any],
    created_at: str,
    comptes: set[int] | None = None,
) -> dict[str, Any]:
    """Textes du LLM, chiffres du radar.

    - prévisions : toujours celles du radar (null + raison) — le LLM ne reçoit
      aucune donnée de ventes, toute valeur serait inventée ;
    - autres listes : éléments du LLM réduits à leur liste blanche, champs
      chiffrés non calculables remis à null avec une raison ; liste absente,
      invalide, ou contenant UN élément non conforme (REV-1) → règles du radar.
    """
    comptes = comptes if comptes is not None else set()
    result = dict(defaults)
    result["predictions"] = _with_origin(defaults["predictions"], "regles")
    for key, (fields, raison) in _LLM_UNCOMPUTABLE_FIELDS.items():
        items = parsed.get(key) if isinstance(parsed, dict) else None
        llm_items = items[:6] if isinstance(items, list) else []
        cleaned = [_llm_item_conforme(key, it, i, comptes) for i, it in enumerate(llm_items)]
        if not cleaned or any(it is None for it in cleaned):
            result[key] = _with_origin(defaults[key], "regles")
            continue
        for it in cleaned:
            for field in fields:
                it[field] = None
            it["raison"] = raison
            it["origine"] = "ia"
            if key == "insights":
                # Pas de date inventée par le LLM.
                it["createdAt"] = created_at
        result[key] = cleaned
    return result


async def _llm_enrich(
    client: Any,
    stats: dict[str, int],
    defaults: dict[str, Any],
    created_at: str,
) -> dict[str, Any]:
    try:
        system_prompt = (
            "Tu es un assistant IA pour dashboard commercial d'un vendeur d'engins. "
            "Retourne uniquement un JSON valide avec les cles: insights, recommendations, predictions, optimizations. "
            # Contrat (b) : le LLM rédige, il ne chiffre pas (tout élément qui
            # chiffre autre chose que les comptes est écarté par _merge_llm_payload).
            "N'invente AUCUN chiffre (montant, pourcentage, ROI, confiance, prevision, delai) : "
            "les seules donnees disponibles sont les comptes fournis dans 'stats' ; "
            "dans les textes, ne cite aucun autre nombre que ces comptes, sans signe, unite ni %. "
            "Garde exactement les cles et valeurs permises de 'defaults' : "
            "insights {id, type (recommendation|alert|prediction|optimization), title, description, "
            "priority (low|medium|high|critical), action} ; "
            "recommendations {id, category (sales|inventory|performance|marketing|content), title, "
            "description, impact (low|medium|high), effort (low|medium|high), actions, priority (rang entier)} ; "
            "optimizations {type, title, description, actions}. Identifiants en lettres minuscules et _ seulement."
        )
        user_prompt = json.dumps(
            {
                "stats": stats,
                "defaults": {k: defaults[k] for k in _LIST_KEYS},
                "constraints": {
                    "language": "fr",
                    "max_items_per_list": 6,
                    "business_focus": True,
                },
            },
            ensure_ascii=False,
        )
        llm_res = await client.complete(system_prompt=system_prompt, user_prompt=user_prompt)
        parsed = json.loads(llm_res.text)
        if isinstance(parsed, dict):
            return _merge_llm_payload(parsed, defaults, created_at, _comptes_reels(stats))
    except Exception:
        pass
    # IA configurée mais en échec : règles du radar (mêmes garanties chiffrées).
    return {**defaults, **{k: _with_origin(defaults[k], "regles") for k in _LIST_KEYS}}


def _mark_simulated(payload: dict[str, Any], simulated: bool) -> dict[str, Any]:
    out = dict(payload)
    for key in _LIST_KEYS:
        out[key] = [
            dict(it, simulated=simulated, origine=it.get("origine") or "regles")
            for it in payload.get(key, [])
            if isinstance(it, dict)
        ]
    return out


async def _build_payload(user_id: str, settings: Settings) -> dict[str, Any]:
    """Cache court TTL pour éviter appels LLM répétés lorsque le front appelle plusieurs endpoints /ai/widgets."""

    now = time.time()
    ttl = settings.payload_cache_ttl_sec
    with _payload_lock:
        hit = _payload_cache.get(user_id)
        if hit and (now - hit[0]) < ttl:
            return hit[1]

    machines = await _fetch_user_machines(settings, user_id)
    stats = _listing_stats(machines)
    machine_count = stats["machine_count"]
    with_images = stats["with_images"]
    created_at = _now_iso()

    defaults = {
        "insights": _default_insights(machine_count, with_images, created_at),
        "recommendations": _default_recommendations(machine_count, with_images),
        "predictions": _default_predictions(),
        "optimizations": _default_optimizations(stats),
        "meta": {
            **stats,
            "user_id": user_id,
        },
    }

    client = get_llm_client()
    simulated = bool(getattr(client, "simulated", False))
    if simulated:
        # Aucune vraie IA : le client simulé n'est pas appelé (ses réponses
        # sont inventées). Les règles ci-dessus suffisent, marquées simulated.
        result = _mark_simulated(defaults, True)
    else:
        result = _mark_simulated(await _llm_enrich(client, stats, defaults, created_at), False)

    with _payload_lock:
        _payload_cache[user_id] = (time.time(), result)
        if len(_payload_cache) > _PAYLOAD_CACHE_MAX_KEYS:
            for k in list(_payload_cache.keys())[: len(_payload_cache) - _PAYLOAD_CACHE_MAX_KEYS]:
                _payload_cache.pop(k, None)
    return result


@router.get("/insights")
async def get_insights(
    user_id: UUID = Depends(ai_widget_user),
    settings: Settings = Depends(get_settings),
):
    payload = await _build_payload(str(user_id), settings)
    return payload.get("insights", [])


@router.get("/recommendations")
async def get_recommendations(
    user_id: UUID = Depends(ai_widget_user),
    settings: Settings = Depends(get_settings),
):
    payload = await _build_payload(str(user_id), settings)
    return payload.get("recommendations", [])


@router.get("/predictions")
async def get_predictions(
    user_id: UUID = Depends(ai_widget_user),
    settings: Settings = Depends(get_settings),
):
    payload = await _build_payload(str(user_id), settings)
    return payload.get("predictions", [])


@router.get("/optimizations")
async def get_optimizations(
    user_id: UUID = Depends(ai_widget_user),
    settings: Settings = Depends(get_settings),
):
    payload = await _build_payload(str(user_id), settings)
    return payload.get("optimizations", [])


@router.get("/benchmark")
async def get_sales_benchmark(
    user_id: UUID = Depends(ai_widget_user),
    settings: Settings = Depends(get_settings),
):
    """Comparaison secteur — NON DISPONIBLE tant que le radar ne reçoit aucune vente.

    Constaté le 2026-10-01 : « average » 65 000 et « top25 » 85 000 étaient des
    constantes, « yourPerformance » valait annonces × 15 000. Mêmes clés, valeurs
    null + raison (contrat (b)). Plus aucune lecture des annonces ici : elles ne
    permettent de calculer aucun de ces trois chiffres.
    """
    return {
        "sector": "Équipements BTP",
        "average": None,
        "top25": None,
        "yourPerformance": None,
        "currency": "MAD",
        "note": "Aucune donnée de ventes (secteur ou vendeur) n'est disponible sur le radar.",
        "raison": _RAISON_BENCHMARK,
        "simulated": llm_is_simulated(settings),
        "origine": "regles",
    }
