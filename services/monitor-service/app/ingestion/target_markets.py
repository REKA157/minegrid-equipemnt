"""Marches CIBLES MineGrid : Afrique + Maghreb + Moyen-Orient + Europe.

Sert a focaliser le connecteur World Bank (qui couvre le monde entier) et a purger
l'existant hors-marche. Correspondance EXACTE (nom normalise : accents/casse retires)
pour eviter les pieges de sous-chaine (« guinea » dans « Papua New Guinea »,
« niger » dans « Nigeria », « mali » dans « Somalia »…).
"""
from __future__ import annotations

import unicodedata


def _norm(s: str | None) -> str:
    s = (s or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


# Noms tels que fournis par les sources (World Bank surtout), + variantes usuelles.
TARGET_COUNTRY_NAMES: tuple[str, ...] = (
    # Maghreb / Afrique du Nord / Moyen-Orient
    "Morocco", "Algeria", "Tunisia", "Libya", "Egypt", "Egypt, Arab Republic of",
    "Mauritania", "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Oman",
    "Bahrain", "Jordan", "Lebanon", "Iraq", "Yemen, Republic of", "Syrian Arab Republic",
    "Iran, Islamic Republic of", "West Bank and Gaza", "Djibouti",
    # Afrique de l'Ouest / Centrale
    "Senegal", "Cote d'Ivoire", "Nigeria", "Cameroon", "Niger", "Burkina Faso", "Mali",
    "Guinea", "Guinea-Bissau", "Benin", "Togo", "Ghana", "Liberia", "Sierra Leone",
    "Gambia, The", "Cabo Verde", "Central African Republic", "Chad", "Gabon",
    "Congo, Democratic Republic of", "Congo, Republic of", "Equatorial Guinea",
    "Sao Tome and Principe", "DRC - Angola",
    # Afrique de l'Est / Australe
    "Ethiopia", "Eritrea", "Sudan", "Tanzania", "Kenya", "Uganda", "Malawi", "Zambia",
    "Zimbabwe", "Mozambique", "Angola", "Madagascar", "Burundi", "Rwanda",
    "Somalia, Federal Republic of", "South Sudan", "Lesotho", "Eswatini", "Botswana",
    "Namibia", "Mauritius", "Comoros", "Seychelles", "South Africa",
    # Regions World Bank (Afrique / MENA)
    "Western and Central Africa", "Eastern and Southern Africa", "Southern Africa",
    "Central Africa", "Africa", "Middle East and North Africa", "Sahel",
    # Europe / Caucase / Balkans
    "Italy", "France", "Germany", "Spain", "Portugal", "Netherlands", "Belgium",
    "United Kingdom", "Greece", "Poland", "Romania", "Bulgaria", "Ukraine", "Turkiye", "Turkey",
    "Georgia", "Armenia", "Azerbaijan", "Kosovo", "Albania", "Montenegro", "Moldova",
    "North Macedonia", "Serbia", "Bosnia and Herzegovina", "Western Balkans",
)

_TARGET_SET = {_norm(n) for n in TARGET_COUNTRY_NAMES}


def is_target_country(name: str | None) -> bool:
    """True si le pays (ou la region WB) fait partie des marches cibles MineGrid."""
    return _norm(name) in _TARGET_SET
