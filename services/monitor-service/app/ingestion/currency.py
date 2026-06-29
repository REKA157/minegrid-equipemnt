"""Conversion indicative de devises -> USD (montants de contrats publics).
Table approximative, suffisante pour un budget indicatif (pas une compta)."""
from __future__ import annotations

import re
from decimal import Decimal

FX_TO_USD: dict[str, float] = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.12,
    # Maghreb / Afrique du Nord / Moyen-Orient
    "MAD": 0.10, "TND": 0.32, "DZD": 0.0074, "EGP": 0.021, "LYD": 0.21, "MRU": 0.025,
    "SAR": 0.27, "AED": 0.27, "QAR": 0.27, "KWD": 3.25, "OMR": 2.60, "BHD": 2.65,
    "JOD": 1.41, "IQD": 0.00076, "LBP": 0.0000111,
    # Afrique de l'Ouest / Centrale
    "XOF": 0.00164, "XAF": 0.00164, "NGN": 0.0012, "GHS": 0.075, "GMD": 0.014, "GNF": 0.000116,
    # Afrique de l'Est / Australe
    "TZS": 0.00040, "KES": 0.0077, "UGX": 0.00027, "ETB": 0.018, "RWF": 0.00078, "BIF": 0.00035,
    "MGA": 0.00022, "MWK": 0.00058, "ZMW": 0.038, "MZN": 0.016, "AOA": 0.0011, "ZAR": 0.055,
    "MUR": 0.022, "SDG": 0.0017,
    # Europe / Caucase
    "TRY": 0.031, "UAH": 0.025, "GEL": 0.37, "RON": 0.22, "PLN": 0.25, "MDL": 0.057,
    "RSD": 0.0092, "MKD": 0.018, "ALL": 0.011, "BGN": 0.55, "NOK": 0.094, "SEK": 0.095, "DKK": 0.145,
}


def amount_to_usd(amount, currency: str | None) -> Decimal | None:
    """Montant + code devise -> USD (Decimal entier). None si devise inconnue/illisible."""
    if amount is None:
        return None
    rate = FX_TO_USD.get((currency or "").upper())
    if not rate:
        return None
    try:
        usd = float(amount) * rate
    except (TypeError, ValueError):
        return None
    return Decimal(str(int(round(usd)))) if usd > 0 else None


def value_text_to_usd(value_str: str | None) -> Decimal | None:
    """« MAD 2560500.00 » -> ~256050 USD."""
    if not value_str:
        return None
    m = re.match(r"\s*([A-Za-z]{2,4})\s*([\d.,]+)", value_str)
    if not m:
        return None
    return amount_to_usd(m.group(2).replace(",", ""), m.group(1))
