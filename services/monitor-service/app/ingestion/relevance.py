"""Filtre de PERTINENCE engins/BTP pour l'ingestion.

Probleme : les portails publics sont scrapes par mots-cles generiques (« marche »,
« avis »…) -> on capture aussi des AO hors-sujet (informatique, assurance, nettoyage,
formation, mobilier…) et meme des fragments non-AO (actualites, noms de directeurs).

Regle : on ne GARDE un projet que s'il a un signal clair de MATERIEL / TRAVAUX / genie
civil / mine (le marche est susceptible de necessiter des engins). Sinon -> rejete.
"""
from __future__ import annotations

# Signaux POSITIFS : engins + travaux / genie civil / mine / infrastructure.
_RELEVANT = (
    # engins de chantier
    "pelle", "excavat", "chargeuse", "chargeur", "bulldozer", "bouteur", "tombereau",
    "dumper", "niveleuse", "compacteur", "rouleau compresseur", "grue", "nacelle",
    "foreuse", "forage", "concasseur", "crible", "tractopelle", "finisseur",
    "camion benne", "camion-benne", "engin", "materiel de chantier", "matériel de chantier",
    "materiel roulant", "matériel roulant", "groupe electrogene", "groupe électrogène",
    # travaux / genie civil / infrastructure
    "travaux", "genie civil", "génie civil", "terrassement", "construction", "btp",
    "batiment", "bâtiment", "route", "autoroute", "voirie", "pont", "ouvrage d'art",
    "barrage", "port ", "portuaire", "quai", "chemin de fer", "voie ferree", "voie ferrée",
    "ferroviaire", "assainissement", "adduction", "amenagement", "aménagement",
    "infrastructure", "canalisation", "conduite", "reseau d'eau", "réseau d'eau",
    "electrification", "électrification", "irrigation", "asphalte", "bitume", "enrobe",
    "enrobé", "beton", "béton", "carriere", "carrière", "mine", "miniere", "minière",
    "extraction", "decapage", "décapage", "remblai", "deblai", "déblai",
)

# Signaux NEGATIFS forts (hors materiel/travaux) : utilises seulement pour trancher
# un titre AMBIGU qui contiendrait par hasard un mot « travaux »/« reseau ».
_IRRELEVANT = (
    "informatique", "logiciel", "ordinateur", "imprimante", "licence", "progiciel",
    "telephonie", "téléphonie", "telecom", "télécom", "internet", "reseau informatique",
    "réseau informatique", "assurance", "nettoyage", "gardiennage", "surveillance",
    "fourniture de bureau", "mobilier", "papeterie", "restauration", "traiteur",
    "formation", "consulting", "audit ", "communication", "evenement", "événement",
    "voyage", "hotel", "hôtel", "produits chimiques", "insecticide", "medicament",
    "médicament", "pharmac", "alimentaire", "uniforme", "vetement", "vêtement",
    "impression", "edition ", "édition ",
)


def relevance_text(title: str | None, raw: dict | None) -> str:
    parts: list[str] = [title or ""]
    if isinstance(raw, dict):
        for v in raw.values():
            if isinstance(v, str):
                parts.append(v)
    return " ".join(parts).lower()


def is_equipment_relevant(title: str | None, raw: dict | None = None) -> bool:
    """True si l'AO est susceptible de necessiter du materiel minier / BTP / travaux."""
    text = relevance_text(title, raw)
    if not text.strip():
        return False
    has_relevant = any(k in text for k in _RELEVANT)
    if not has_relevant:
        return False  # aucun signal materiel/travaux -> hors-scope (informatique, services, bruit)
    # Signal materiel present, mais titre clairement « service » (ex. « assurance des travaux ») :
    # rejeter si un signal hors-sujet FORT domine et qu'on n'a pas de vrai mot d'engin/chantier.
    has_irrelevant = any(k in text for k in _IRRELEVANT)
    if has_irrelevant:
        strong_works = any(
            k in text
            for k in (
                "travaux", "construction", "terrassement", "genie civil", "génie civil",
                "engin", "pelle", "excavat", "chargeuse", "bulldozer", "route", "barrage",
                "btp", "chantier", "carriere", "carrière", "mine", "forage",
            )
        )
        if not strong_works:
            return False
    return True
