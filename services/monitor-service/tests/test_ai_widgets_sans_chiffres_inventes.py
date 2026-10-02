"""Widgets /ai/widgets/* : aucun chiffre inventé, simulation signalée.

Contrat partagé radar ↔ front du 2026-10-01 :
  (a) simulated=true sur chaque objet d'analyse quand aucune vraie IA n'est
      configurée ;
  (b) aucun chiffre écrit en dur ou fabriqué : null + « raison ».

Constaté le 2026-10-01 : benchmark 65 000 / 85 000 en dur, « votre
performance » et ventes = annonces × 15 000, confiance 0,78, ROI 0,6, impacts
« 20-30 % » identiques pour tous, createdAt = "now".

Aucun appel réseau : les annonces (Supabase) et le client IA sont remplacés.
"""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.llm.client import LLMResponse
from app.llm.mock_client import MockLLMClient
from app.routes import ai_widgets as aw

USER = str(uuid.uuid4())

# 3 annonces réelles typiques : une complète, une sans photo ni année, une
# sans marque avec description courte.
MACHINES = [
    {
        "brand": "Caterpillar", "model": "320", "year": 2018,
        "images": ["a.jpg"], "photos": [],
        "description": "Pelle hydraulique sur chenilles, entretien suivi, 6 500 h, godet curage et godet terrassement fournis.",
    },
    {"brand": "Volvo", "model": "L120", "year": None, "images": [], "photos": [], "description": "Chargeuse"},
    {"brand": "", "model": "D6", "year": 2015, "images": [], "photos": ["p.jpg"], "description": None},
]


def _settings(provider="none", key=""):
    return SimpleNamespace(
        payload_cache_ttl_sec=0.0,  # pas de cache entre deux tests
        llm_provider=provider,
        llm_api_key=key,
        supabase_url="https://exemple.supabase.co",
        supabase_service_role_key="cle-factice",
    )


class _SpyMock(MockLLMClient):
    """Client simulé qui compte ses appels (il ne doit plus être appelé)."""

    def __init__(self):
        self.calls = 0

    async def complete(self, system_prompt, user_prompt):
        self.calls += 1
        return await super().complete(system_prompt, user_prompt)


class _FakeRealLLM:
    """Faux client « vraie IA » (simulated=False) qui INVENTE des chiffres."""

    simulated = False

    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error
        self.calls = 0

    async def complete(self, system_prompt, user_prompt):
        self.calls += 1
        if self.error:
            raise self.error
        return LLMResponse(text=json.dumps(self.payload), model="faux-modele", tokens_used=0)


@pytest.fixture(autouse=True)
def _vider_cache():
    aw._payload_cache.clear()
    yield
    aw._payload_cache.clear()


def _payload(client, machines=MACHINES):
    with patch.object(aw, "_fetch_user_machines", AsyncMock(return_value=machines)), \
         patch.object(aw, "get_llm_client", return_value=client):
        return asyncio.run(aw._build_payload(USER, _settings()))


def _nombres(obj, chemin=""):
    """Toutes les valeurs numériques (hors booléens) d'une structure, avec leur clé."""
    if isinstance(obj, bool):
        return []
    if isinstance(obj, (int, float)):
        return [(chemin, obj)]
    if isinstance(obj, dict):
        return [n for k, v in obj.items() for n in _nombres(v, k)]
    if isinstance(obj, list):
        return [n for v in obj for n in _nombres(v, chemin)]
    return []


def _servi(payload):
    return {k: payload[k] for k in aw._LIST_KEYS}


# ---------------------------------------------------------------------------
# Mode simulé (aucune clé) : règles du radar, aucun chiffre inventé.
# ---------------------------------------------------------------------------

def test_aucun_chiffre_servi_hors_rang_de_priorite():
    """Le seul nombre servi est le rang « priority » des recommandations.
    Tout autre chiffre (ventes, confiance, ROI…) serait inventé."""
    payload = _payload(_SpyMock())
    nombres = _nombres(_servi(payload))
    assert nombres, "la structure servie doit contenir au moins les rangs"
    assert {cle for cle, _ in nombres} == {"priority"}


def test_previsions_null_avec_raison():
    payload = _payload(_SpyMock())
    preds = payload["predictions"]
    assert [p["metric"] for p in preds] == ["Ventes mensuelles", "Taux de conversion"]
    for p in preds:
        for champ in ("currentValue", "predictedValue", "confidence", "trend"):
            assert champ in p and p[champ] is None, champ
        assert isinstance(p["raison"], str) and p["raison"].strip()


def test_recommandations_constats_optimisations_null_avec_raison():
    payload = _payload(_SpyMock())
    for r in payload["recommendations"]:
        assert "roi" in r and r["roi"] is None
        assert r["raison"].strip()
    for i in payload["insights"]:
        assert "confidence" in i and i["confidence"] is None
        assert i["raison"].strip()
        # Vraie date ISO, plus le texte "now".
        datetime.fromisoformat(i["createdAt"])
    for o in payload["optimizations"]:
        assert "expectedImpact" in o and o["expectedImpact"] is None
        assert o["raison"].strip()


def test_comptes_reels_sur_les_annonces():
    payload = _payload(_SpyMock())
    insights = {i["id"]: i for i in payload["insights"]}
    assert insights["inventory_detected"]["description"].startswith("3 machine(s)")
    assert insights["missing_images"]["description"].startswith("1 annonce(s)")
    seo, contenu = payload["optimizations"]
    assert "2 annonce(s) sur 3 sans marque, modèle ou année" in seo["description"]
    assert "2 annonce(s) sur 3 sans description" in contenu["description"]


def test_mode_simule_marque_chaque_objet_et_n_appelle_pas_le_client_simule():
    client = _SpyMock()
    payload = _payload(client)
    assert client.calls == 0
    for key in aw._LIST_KEYS:
        assert payload[key], key
        for item in payload[key]:
            assert item["simulated"] is True
            assert item["origine"] == "regles"


def test_routes_listes_renvoient_simulated_sur_chaque_element():
    async def appeler():
        return {
            "insights": await aw.get_insights(user_id=uuid.UUID(USER), settings=_settings()),
            "predictions": await aw.get_predictions(user_id=uuid.UUID(USER), settings=_settings()),
            "recommendations": await aw.get_recommendations(user_id=uuid.UUID(USER), settings=_settings()),
            "optimizations": await aw.get_optimizations(user_id=uuid.UUID(USER), settings=_settings()),
        }

    with patch.object(aw, "_fetch_user_machines", AsyncMock(return_value=MACHINES)), \
         patch.object(aw, "get_llm_client", return_value=_SpyMock()):
        reponses = asyncio.run(appeler())
    for key, items in reponses.items():
        assert items and all(it["simulated"] is True for it in items), key


# ---------------------------------------------------------------------------
# Benchmark
# ---------------------------------------------------------------------------

def test_benchmark_sans_constantes_ni_multiplication():
    with patch.object(aw, "_fetch_user_machines", AsyncMock(return_value=MACHINES)) as fetch:
        b = asyncio.run(aw.get_sales_benchmark(user_id=uuid.UUID(USER), settings=_settings()))
    assert b["average"] is None
    assert b["top25"] is None
    assert b["yourPerformance"] is None
    assert b["raison"].strip()
    assert b["simulated"] is True
    assert set(b) >= {"sector", "average", "top25", "yourPerformance", "currency", "note"}
    assert not _nombres(b)
    fetch.assert_not_called()  # les annonces ne permettent aucun de ces chiffres


def test_benchmark_vraie_ia_configuree_simulated_false():
    b = asyncio.run(aw.get_sales_benchmark(
        user_id=uuid.UUID(USER), settings=_settings(provider="openai", key="cle-factice"),
    ))
    assert b["simulated"] is False
    assert b["average"] is None and b["top25"] is None and b["yourPerformance"] is None


# ---------------------------------------------------------------------------
# Vraie IA (faux client, aucun réseau) : textes du LLM, chiffres du radar.
# ---------------------------------------------------------------------------

REPONSE_LLM_QUI_INVENTE = {
    "insights": [{"id": "x", "type": "alert", "title": "Stock attractif", "description": "…",
                  "confidence": 0.95, "priority": "high", "createdAt": "2020-01-01",
                  "data": {"vues": 1234}}],
    "recommendations": [{"id": "r", "category": "sales", "title": "Baisser les prix",
                         "description": "…", "impact": "high", "effort": "low", "roi": 0.42,
                         # Champ chiffré INCONNU du schéma : inventé lui aussi.
                         "score": 87, "actions": ["a", 3], "priority": 1}],
    "predictions": [{"metric": "Ventes mensuelles", "currentValue": 45000, "predictedValue": 52000,
                     "confidence": 0.9, "timeframe": "30d", "trend": "up", "factors": []}],
    "optimizations": [{"type": "seo_optimization", "title": "Titres", "description": "…",
                       "actions": ["b"], "expectedImpact": "+25 % de visibilité"}],
}


def test_vraie_ia_chiffres_du_llm_remis_a_null():
    client = _FakeRealLLM(payload=REPONSE_LLM_QUI_INVENTE)
    payload = _payload(client)
    assert client.calls == 1
    assert {cle for cle, _ in _nombres(_servi(payload))} == {"priority"}
    ins = payload["insights"][0]
    assert ins["title"] == "Stock attractif" and ins["origine"] == "ia"
    assert ins["confidence"] is None and ins["raison"].strip()
    assert "data" not in ins and ins["createdAt"] != "2020-01-01"
    rec = payload["recommendations"][0]
    assert rec["title"] == "Baisser les prix" and rec["roi"] is None and rec["raison"].strip()
    # Clé inconnue du schéma : retirée (relecture REV-1, liste blanche de clés).
    assert "score" not in rec and rec["actions"] == ["a"] and rec["priority"] == 1
    opt = payload["optimizations"][0]
    assert opt["title"] == "Titres" and opt["expectedImpact"] is None
    # Prévisions : jamais celles du LLM (aucune donnée de ventes ne lui est donnée).
    assert all(p["currentValue"] is None and p["predictedValue"] is None for p in payload["predictions"])
    assert all(p["origine"] == "regles" for p in payload["predictions"])
    # Vraie IA configurée : rien n'est marqué simulé (comportement inchangé).
    for key in aw._LIST_KEYS:
        assert all(it["simulated"] is False for it in payload[key]), key


def test_vraie_ia_en_echec_regles_sans_chiffre_et_non_simule():
    client = _FakeRealLLM(error=RuntimeError("délai dépassé"))
    payload = _payload(client)
    assert client.calls == 1
    assert {cle for cle, _ in _nombres(_servi(payload))} == {"priority"}
    for key in aw._LIST_KEYS:
        assert payload[key], key
        assert all(it["simulated"] is False and it["origine"] == "regles" for it in payload[key])


def test_compte_vide_aucune_annonce():
    payload = _payload(_SpyMock(), machines=[])
    assert [i["id"] for i in payload["insights"]] == ["no_inventory"]
    assert {cle for cle, _ in _nombres(_servi(payload))} == {"priority"}


# ---------------------------------------------------------------------------
# Relecture du 2026-10-01, REV-1 : chiffres écrits EN TEXTE par le LLM.
#
# Constaté le 2026-10-01 (relecture) : seuls les nombres de type int/float
# étaient remis à null. Un texte « ROI attendu 60 %, +20-30 % de contacts »,
# une clé inconnue « confidence »: « 92 % » ou une « priority » 0,9 sur un
# constat passaient intacts, servis avec origine="ia" (le « 20-30 % » même que
# le contrat (b) interdit). Les comptes réels des annonces de MACHINES
# (3 annonces, 1 sans photo, 2 titres incomplets, 2 descriptions courtes) sont
# les seuls nombres qu'un texte du LLM peut citer.
# ---------------------------------------------------------------------------

COMPTES_MACHINES = {"1", "2", "3"}

REPONSE_LLM_CHIFFRES_EN_TEXTE = {
    "recommendations": [{"id": "r", "category": "sales", "title": "Relancer les prospects",
                         "description": "ROI attendu 60 %, +20-30 % de contacts", "impact": "high",
                         "effort": "low", "confidence": "92 %", "expectedImpact": "+25 %",
                         "actions": ["Relancer"], "priority": 1}],
    "insights": [{"id": "i", "type": "prediction", "title": "Ventes en hausse",
                  "description": "Vos ventes devraient atteindre 52 000 MAD (+12 %)", "priority": 0.9}],
    "optimizations": [{"type": "seo_optimization", "title": "Titres",
                       # « 3 » est un compte réel, mais « 3 fois plus de vues » est inventé.
                       "description": "Gagnez 3 fois plus de vues", "actions": ["Ajouter la marque"]}],
}

REPONSE_LLM_CONFORME = {
    "insights": [{"id": "photos", "type": "alert", "title": "Photos manquantes",
                  "description": "1 annonce sur 3 n'a aucune photo.", "priority": "high",
                  "action": "Ajouter des photos", "confidence": "élevée", "score": "92"}],
    "recommendations": [{"id": "visuels", "category": "marketing", "title": "Soigner les visuels",
                         "description": "Ajoutez des photos à l'annonce concernée.", "impact": "high",
                         "effort": "low", "actions": ["Photographier la machine"], "priority": 1,
                         "expectedImpact": "fort"}],
    "optimizations": [{"type": "seo_optimization", "title": "Titres complets",
                       "description": "2 annonces sur 3 n'ont pas de titre complet.",
                       "actions": ["Ajouter l'année"]}],
}


def _textes_ia(payload):
    """(liste, clé, texte) de chaque chaîne servie dans un élément d'origine IA."""
    textes = []
    for key in aw._LIST_KEYS:
        for it in payload[key]:
            if it.get("origine") != "ia":
                continue
            for champ, valeur in it.items():
                if champ == "createdAt":  # date ISO posée par le radar
                    continue
                for v in valeur if isinstance(valeur, list) else [valeur]:
                    if isinstance(v, str):
                        textes.append((key, champ, v))
    return textes


def test_vraie_ia_chiffres_ecrits_en_texte_jamais_servis():
    client = _FakeRealLLM(payload=REPONSE_LLM_CHIFFRES_EN_TEXTE)
    payload = _payload(client)
    assert client.calls == 1
    servi = json.dumps(_servi(payload), ensure_ascii=False)
    for invente in ("60 %", "20-30", "92 %", "+25 %", "52 000", "+12 %", "fois plus", "Ventes en hausse"):
        assert invente not in servi, invente
    # Liste du LLM non conforme → règles du radar (comptes réels), jamais simulées.
    for key in ("insights", "recommendations", "optimizations"):
        assert payload[key], key
        assert all(it["origine"] == "regles" and it["simulated"] is False for it in payload[key]), key


def test_vraie_ia_conforme_textes_gardes_et_cles_inconnues_retirees():
    payload = _payload(_FakeRealLLM(payload=REPONSE_LLM_CONFORME))
    ins = payload["insights"][0]
    assert ins["origine"] == "ia" and ins["description"] == "1 annonce sur 3 n'a aucune photo."
    assert "score" not in ins and ins["confidence"] is None and ins["priority"] == "high"
    rec = payload["recommendations"][0]
    assert rec["origine"] == "ia" and rec["title"] == "Soigner les visuels"
    assert "expectedImpact" not in rec and rec["roi"] is None
    opt = payload["optimizations"][0]
    assert opt["origine"] == "ia" and opt["expectedImpact"] is None


def test_un_seul_element_non_conforme_toute_la_liste_aux_regles():
    """Un LLM qui invente un chiffre n'est pas cru sur le reste de sa liste."""
    reponse = dict(REPONSE_LLM_CONFORME)
    reponse["insights"] = REPONSE_LLM_CONFORME["insights"] + [
        {"id": "hausse", "type": "prediction", "title": "Demande en hausse",
         "description": "La demande progresse de 3 fois.", "priority": "high"},
    ]
    payload = _payload(_FakeRealLLM(payload=reponse))
    assert [i["id"] for i in payload["insights"]] == ["inventory_detected", "missing_images"]
    assert all(i["origine"] == "regles" for i in payload["insights"])
    # Les autres listes, conformes, restent celles du LLM.
    assert payload["recommendations"][0]["origine"] == "ia"


@pytest.mark.parametrize(
    "liste,remplacement",
    [
        ("insights", {"priority": 0.9}),            # rang chiffré au lieu d'un niveau
        ("insights", {"type": "tendance"}),
        ("recommendations", {"impact": "+25 %"}),
        ("recommendations", {"effort": None}),
        ("optimizations", {"type": "seo2024"}),     # identifiant chiffré
    ],
)
def test_enumerations_et_identifiants_hors_liste_ecartes(liste, remplacement):
    reponse = {k: [dict(it) for it in v] for k, v in REPONSE_LLM_CONFORME.items()}
    reponse[liste][0].update(remplacement)
    payload = _payload(_FakeRealLLM(payload=reponse))
    assert all(it["origine"] == "regles" for it in payload[liste]), liste
    servi = json.dumps(payload[liste], ensure_ascii=False)
    for valeur in remplacement.values():
        if valeur is not None:
            assert json.dumps(valeur, ensure_ascii=False) not in servi


@pytest.mark.parametrize(
    "reponse", [REPONSE_LLM_QUI_INVENTE, REPONSE_LLM_CHIFFRES_EN_TEXTE, REPONSE_LLM_CONFORME],
    ids=["nombres", "chiffres-en-texte", "conforme"],
)
def test_textes_ia_ne_citent_que_les_comptes_reels(reponse):
    """Chaque chaîne servie d'origine IA : aucun chiffre hors des comptes réels, aucun %."""
    payload = _payload(_FakeRealLLM(payload=reponse))
    for key, champ, texte in _textes_ia(payload):
        assert set(re.findall(r"\d+", texte)) <= COMPTES_MACHINES, (key, champ, texte)
        assert "%" not in texte, (key, champ, texte)


@pytest.mark.parametrize(
    "texte,invente",
    [
        ("3 annonces sur 3", False),
        ("1 annonce sans photo.", False),
        ("Ajoutez des photos", False),
        ("7 annonces", True),           # pas un compte réel
        ("+3 annonces", True),          # variation
        ("3 %", True),
        ("vingt pour cent", True),
        ("3 fois plus de vues", True),  # compte réel détourné
        ("3 jours", True),
        ("52 000 MAD", True),
        ("0,9", True),
        ("J+1", True),
        ("2h", True),
    ],
)
def test_detection_des_chiffres_hors_comptes(texte, invente):
    assert aw._chiffre_hors_comptes(texte, {1, 2, 3}) is invente


# ---------------------------------------------------------------------------
# Relecture du 2026-10-01, REV-4 : une panne Supabase n'est pas « zéro annonce ».
#
# Constaté le 2026-10-01 (relecture) : _fetch_user_machines renvoyait [] pour
# TOUT statut non 2xx. Clé service_role révoquée (401) ou Supabase en 5xx :
# le vendeur aux 40 annonces lisait « Aucune annonce active » (priorité
# critical) et « Créer vos premières annonces ». Et les machines vendues
# étaient comptées comme des annonces actives.
# ---------------------------------------------------------------------------

_VRAI_ASYNC_CLIENT = httpx.AsyncClient


def _supabase(reponses):
    """Remplace Supabase (aucun réseau) : une réponse (statut, corps) par colonne tentée."""
    appels = []

    def handler(request):
        appels.append(str(request.url))
        statut, corps = reponses[min(len(appels), len(reponses)) - 1]
        if isinstance(corps, Exception):
            raise corps
        return httpx.Response(statut, json=corps)

    transport = httpx.MockTransport(handler)
    fabrique = lambda **kw: _VRAI_ASYNC_CLIENT(transport=transport, **kw)  # noqa: E731
    return patch.object(aw.httpx, "AsyncClient", fabrique), appels


def _lire_annonces(reponses):
    remplacement, appels = _supabase(reponses)
    with remplacement:
        return asyncio.run(aw._fetch_user_machines(_settings(), USER)), appels


@pytest.mark.parametrize("statut", [401, 403, 429, 500, 502, 503])
def test_panne_supabase_503_jamais_zero_annonce(statut):
    remplacement, appels = _supabase([(statut, {"message": "panne"})])
    with remplacement, patch.object(aw, "get_llm_client", return_value=_SpyMock()):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(aw._build_payload(USER, _settings()))
    assert exc.value.status_code == 503
    assert "annonces" in exc.value.detail
    assert len(appels) == 1  # une panne n'est pas une colonne inexistante
    assert USER not in aw._payload_cache  # rien n'est mis en cache


def test_colonne_inexistante_essaie_la_suivante():
    machines, appels = _lire_annonces([(400, {"code": "42703"}), (200, MACHINES)])
    assert len(machines) == 3
    assert len(appels) == 2 and "seller_id=eq." in appels[1]


def test_aucune_colonne_de_proprietaire_reconnue_503():
    remplacement, appels = _supabase([(400, {}), (400, {}), (404, {}), (400, {})])
    with remplacement, pytest.raises(HTTPException) as exc:
        asyncio.run(aw._fetch_user_machines(_settings(), USER))
    assert exc.value.status_code == 503 and len(appels) == 4


@pytest.mark.parametrize(
    "corps", [httpx.ConnectError("injoignable"), {"message": "objet au lieu d'une liste"}],
    ids=["reseau", "corps-illisible"],
)
def test_annonces_illisibles_503(corps):
    remplacement, _ = _supabase([(200, corps)])
    with remplacement, pytest.raises(HTTPException) as exc:
        asyncio.run(aw._fetch_user_machines(_settings(), USER))
    assert exc.value.status_code == 503


def test_machines_vendues_ou_reservees_non_comptees():
    lot = [
        dict(MACHINES[0], status="available"),
        dict(MACHINES[1], status="sold"),
        dict(MACHINES[2], status="reserved"),
        dict(MACHINES[0]),  # colonne status absente : gardée
    ]
    machines, _ = _lire_annonces([(200, lot)])
    assert len(machines) == 2
    assert all(m.get("status") in (None, "available") for m in machines)
