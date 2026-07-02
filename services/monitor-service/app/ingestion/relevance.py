"""Filtre de PERTINENCE engins/BTP pour l'ingestion (bilingue FR/EN).

Probleme : les sources (portails + World Bank) ramenent aussi des marches hors-sujet
(informatique, medical, mobilier, assurance, services, consulting) et du bruit.

Regle : on ne GARDE un marche que s'il a un signal clair de MATERIEL / TRAVAUX / genie
civil / mine / infrastructure. Garde-fou : si un signal HORS-SUJET fort est present
SANS vrai mot de travaux/engin, on rejette (ex. « medical equipment ... installation »).
"""
from __future__ import annotations

# --- Signaux POSITIFS (FR + EN) : engins + travaux / genie civil / mine / infra. ---
_RELEVANT = (
    # engins de chantier
    "pelle", "excavat", "chargeuse", "chargeur", "bulldozer", "bouteur", "tombereau",
    "dumper", "niveleuse", "compacteur", "rouleau compresseur", "grue", "crane",
    "nacelle", "foreuse", "forage", "drilling", "borehole", "concasseur", "crusher",
    "crible", "tractopelle", "finisseur", "paver", "camion benne", "camion-benne",
    "engin", "materiel de chantier", "matériel de chantier", "groupe electrogene",
    "groupe électrogène",
    # travaux / genie civil / infrastructure (FR)
    "travaux", "genie civil", "génie civil", "terrassement", "construction", "btp",
    "batiment", "bâtiment", "route", "autoroute", "voirie", "pont", "ouvrage d'art",
    "barrage", "portuaire", "quai", "chemin de fer", "voie ferree", "voie ferrée",
    "ferroviaire", "assainissement", "adduction", "amenagement", "aménagement",
    "infrastructure", "canalisation", "conduite", "electrification", "électrification",
    "irrigation", "asphalte", "bitume", "enrobe", "enrobé", "beton", "béton",
    "carriere", "carrière", "mine", "miniere", "minière", "extraction", "decapage",
    "décapage", "remblai", "deblai", "déblai",
    # travaux / infrastructure (EN) — phrases sures (eviter sous-chaines pieges)
    "civil works", "earthworks", "earthwork", "road works", "roadworks", "roadwork",
    "rehabilitation", "drainage", "sewerage", "water supply", "pavement", "paving",
    "asphalt", "bitumen", "concrete", "embankment", "culvert", "bridge", "highway",
    "dam ", "dredging", "pipeline", "transmission line", "power line", "substation",
    "quarry", "mining", "excavation", "feeder road",
)

# --- Signaux NEGATIFS forts (FR + EN) : tranche un titre AMBIGU sans vrai mot travaux. ---
_IRRELEVANT = (
    # FR
    "informatique", "logiciel", "ordinateur", "imprimante", "licence", "progiciel",
    "telephonie", "téléphonie", "telecom", "télécom", "assurance", "nettoyage",
    "gardiennage", "fourniture de bureau", "mobilier", "papeterie", "restauration",
    "traiteur", "formation", "consulting", "communication", "evenement", "événement",
    "voyage", "hotel", "hôtel", "produits chimiques", "insecticide", "medicament",
    "médicament", "pharmac", "alimentaire", "uniforme", "vetement", "vêtement",
    # EN
    "medical", "hospital", "clinic", "health center", "pharmaceutical", "software",
    "computer", "laptop", "printer", "furniture", "stationery", "textbook", "books",
    "uniform", "catering", "cleaning", "insurance", "consultancy", "consultant",
    "supervision", "audit ", "training", "workshop", "seminar", "broadband",
    "vaccine", "drugs", "internet",
)

# Mots TRAVAUX FORTS : leur presence neutralise un signal hors-sujet (FR + EN).
_STRONG_WORKS = (
    "travaux", "construction", "terrassement", "genie civil", "génie civil", "engin",
    "pelle", "excavat", "chargeuse", "bulldozer", "route", "barrage", "btp", "chantier",
    "carriere", "carrière", "mine", "miniere", "minière", "forage", "drilling",
    "borehole", "civil works", "earthworks", "road works", "rehabilitation", "asphalt",
    "bitumen", "dredging", "excavation", "pipeline", "irrigation", "bridge", "highway",
)


# Lexique ENGINS / MATERIEL LOURD — pour la categorie 'goods' (achat de biens) : on ne garde
# un bien que s'il s'agit d'un vrai engin/machine de chantier (pas eau/papeterie/labo/IT).
# Termes specifiques (compound) pour eviter les faux positifs ('engin' eviterait 'engineer').
_MACHINE = (
    # FR
    "pelle", "pelleteuse", "excavat", "chargeuse", "chargeur", "bulldozer", "bouteur",
    "tombereau", "tracto-pelle", "tractopelle", "niveleuse", "motoniveleuse", "compacteur",
    "rouleau compacteur", "foreuse", "forage", "concasseur", "crible", "finisseur",
    "camion benne", "camion-benne", "camion", "benne", "grue", "nacelle", "dumper",
    "groupe electrogene", "groupe électrogène", "compresseur", "betonniere", "bétonnière",
    "malaxeur", "chariot elevateur", "chariot élévateur", "engins de chantier",
    "engin de chantier", "materiel de chantier", "matériel de chantier", "pompe a beton",
    # EN
    "excavator", "wheel loader", "front loader", "payloader", "backhoe", "dozer",
    "motor grader", "compactor", "vibratory roller", "road roller", "dump truck",
    "tipper", "crane", "drilling rig", "drill rig", "borehole", "crusher", "crushing plant",
    "asphalt plant", "batching plant", "concrete mixer", "concrete pump", "generator set",
    "generating set", "genset", "generator", "air compressor", "forklift", "telehandler",
    "skid steer", "earthmoving", "earth-moving", "heavy machinery", "construction equipment",
    "construction machinery", "wheel loader", "graders", "truck",
)


def relevance_text(title: str | None, raw: dict | None) -> str:
    parts: list[str] = [title or ""]
    if isinstance(raw, dict):
        for v in raw.values():
            if isinstance(v, str):
                parts.append(v)
    return " ".join(parts).lower()


def is_equipment_relevant(title: str | None, raw: dict | None = None) -> bool:
    """True si le marche est susceptible de necessiter du materiel minier / BTP / travaux."""
    # Categorie OCDS structuree (autoritaire) : 'works' = travaux (toujours pertinent),
    # 'services' = prestations (consultants/interim/IT) -> jamais, 'goods' = bien -> seulement
    # si c'est un vrai ENGIN/machine. Categorie inconnue (WB, portails) -> mots-cles.
    text = relevance_text(title, raw)
    if isinstance(raw, dict):
        cat = (raw.get("procurement_category") or "").lower()
        if cat == "services":
            return False
        if cat == "works":
            return True
        if cat == "goods":
            return any(k in text for k in _MACHINE)
    if not text.strip():
        return False
    if not any(k in text for k in _RELEVANT):
        return False  # aucun signal materiel/travaux -> hors-scope
    # Signal present, mais marche clairement « hors-sujet » (medical, IT, mobilier…) :
    # rejeter SAUF si un vrai mot de travaux/engin domine.
    if any(k in text for k in _IRRELEVANT) and not any(k in text for k in _STRONG_WORKS):
        return False
    return True
