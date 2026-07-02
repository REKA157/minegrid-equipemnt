"""Centroides pays (hors-ligne) — repli quand le geocodage par titre echoue.

Beaucoup d'avis (World Bank) ont un titre = description (pas un lieu) : Photon ne trouve
rien -> projet sans coordonnees -> carte vide. On retombe alors sur le centroide du pays
(approximatif mais suffisant pour situer le marche sur la carte). Cles = noms tels que
fournis par les sources (World Bank), accents/casse normalises au lookup.
"""
from __future__ import annotations

import unicodedata


def _norm(s: str | None) -> str:
    s = (s or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


_RAW: dict[str, tuple[float, float]] = {
    # Maghreb / Afrique du Nord / Moyen-Orient
    "Morocco": (31.79, -7.09), "Tunisia": (33.89, 9.54), "Egypt": (26.82, 30.80),
    "Egypt, Arab Republic of": (26.82, 30.80), "Mauritania": (21.0, -10.95),
    "Iraq": (33.22, 43.68), "Lebanon": (33.85, 35.86), "West Bank and Gaza": (31.95, 35.30),
    "Djibouti": (11.83, 42.59),
    # Afrique de l'Ouest / Centrale
    "Senegal": (14.50, -14.45), "Cote d'Ivoire": (7.54, -5.55), "Cote d`Ivoire": (7.54, -5.55),
    "Nigeria": (9.08, 8.68), "Cameroon": (7.37, 12.35), "Niger": (17.61, 8.08),
    "Burkina Faso": (12.24, -1.56), "Mali": (17.57, -4.00), "Guinea": (9.95, -9.70),
    "Benin": (9.31, 2.32), "Ghana": (7.95, -1.02), "Liberia": (6.43, -9.43),
    "Sierra Leone": (8.46, -11.78), "Gambia, The": (13.44, -15.31), "Cabo Verde": (16.0, -24.0),
    "Central African Republic": (6.61, 20.94), "Congo, Democratic Republic of": (-4.04, 21.76),
    "DRC - Angola": (-7.0, 19.0),
    # Afrique de l'Est / Australe
    "Ethiopia": (9.15, 40.49), "Tanzania": (-6.37, 34.89), "Kenya": (-0.02, 37.91),
    "Uganda": (1.37, 32.29), "Malawi": (-13.25, 34.30), "Zambia": (-13.13, 27.85),
    "Mozambique": (-18.67, 35.53), "Angola": (-11.20, 17.87), "Madagascar": (-18.77, 46.87),
    "Burundi": (-3.37, 29.92), "Rwanda": (-1.94, 29.87), "Somalia, Federal Republic of": (5.15, 46.20),
    "South Sudan": (6.88, 31.31), "Lesotho": (-29.61, 28.23), "Mauritius": (-20.35, 57.55),
    "Comoros": (-11.65, 43.33),
    # Regions World Bank
    "Western and Central Africa": (6.0, 12.0), "Eastern and Southern Africa": (-6.0, 35.0),
    "Southern Africa": (-22.0, 26.0), "Central Africa": (5.0, 18.0),
    "Western Balkans": (43.5, 20.0),
    # Asie (presents dans les donnees WB)
    "Uzbekistan": (41.38, 64.59), "India": (22.0, 79.0), "Bangladesh": (23.68, 90.36),
    "Pakistan": (30.38, 69.35), "Afghanistan": (33.94, 67.71), "Sri Lanka": (7.87, 80.77),
    "Nepal": (28.39, 84.12), "Bhutan": (27.51, 90.43), "Tajikistan": (38.86, 71.28),
    "Kyrgyz Republic": (41.20, 74.77), "Cambodia": (12.57, 104.99), "Viet Nam": (14.06, 108.28),
    "Lao People's Democratic Republic": (19.86, 102.50), "Philippines": (12.88, 121.77),
    "Papua New Guinea": (-6.31, 143.96), "Solomon Islands": (-9.65, 160.16), "Kiribati": (-3.37, -168.73),
    # Europe / Caucase
    "Italy": (41.87, 12.57), "Ukraine": (48.38, 31.17), "Turkiye": (38.96, 35.24),
    "Georgia": (42.32, 43.36), "Kosovo": (42.60, 20.90), "Albania": (41.15, 20.17),
    "Montenegro": (42.71, 19.37), "Moldova": (47.41, 28.37),
    # Ameriques
    "El Salvador": (13.79, -88.90), "Honduras": (15.20, -86.24), "Haiti": (18.97, -72.29),
    "Ecuador": (-1.83, -78.18), "Brazil": (-14.24, -51.93), "Argentina": (-38.42, -63.62),
    "Peru": (-9.19, -75.02),
}

# Alias usuels (orthographes alternatives) -> meme centroide.
_ALIASES: dict[str, str] = {
    "Turkey": "Turkiye", "Vietnam": "Viet Nam", "Laos": "Lao People's Democratic Republic",
    "Kyrgyzstan": "Kyrgyz Republic", "Cape Verde": "Cabo Verde", "Gambia": "Gambia, The",
    "Somalia": "Somalia, Federal Republic of", "DRC": "Congo, Democratic Republic of",
    "Democratic Republic of the Congo": "Congo, Democratic Republic of",
    "Ivory Coast": "Cote d'Ivoire", "Egypt, Arab Rep.": "Egypt",
}

COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {_norm(k): v for k, v in _RAW.items()}
for _alias, _target in _ALIASES.items():
    COUNTRY_CENTROIDS[_norm(_alias)] = _RAW[_target]


def country_centroid(name: str | None) -> tuple[float, float] | None:
    """Retourne (lat, lon) du centroide pays, ou None si inconnu."""
    return COUNTRY_CENTROIDS.get(_norm(name))
