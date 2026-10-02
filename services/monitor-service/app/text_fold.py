"""
Comparaison de libellés « sans accents ni casse », identique en Python et en SQL.

Constaté le 2026-10-01 (audit du 2026-09-08, #global-monitor) : le filtre pays de
GET /projects et l'évaluateur d'alertes comparaient les pays par égalité stricte.
Les sources n'écrivent pas les pays de la même façon (Banque mondiale :
« Cote d'Ivoire » ; portails francophones : « Côte d'Ivoire » ; parfois une
apostrophe typographique « ’ »). Une règle « Côte d'Ivoire » ignorait donc en
silence tous les projets stockés « Cote d'Ivoire » : le résultat dépendait de la
source, sans que l'utilisateur puisse le voir.

Pourquoi une TABLE de correspondance plutôt que l'extension Postgres `unaccent` :
l'extension n'est pas installée sur la base du radar, et l'installer demande une
migration et des droits superutilisateur. `translate()` et `lower()` sont natifs.
La même table sert aux deux côtés (Python et SQL) : ils ne peuvent pas diverger.
Comme `translate()` retire les accents AVANT `lower()`, `lower()` n'a plus à
traiter que de l'ASCII : le résultat ne dépend pas de la locale de la base.
"""
from __future__ import annotations

import unicodedata

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement


def _build_accent_table() -> tuple[str, str]:
    """Construit les chaînes source/cible pour `translate()`.

    On parcourt Latin-1 Supplément + Latin étendu A/B (À…ɏ) et on garde chaque
    lettre dont la décomposition Unicode est « une lettre ASCII + des accents »
    (é → e, Ô → O, ç → c, ñ → n…). Les lettres sans décomposition (ø, æ, œ, ß)
    restent telles quelles des deux côtés : la comparaison reste cohérente.
    """
    src: list[str] = []
    dst: list[str] = []
    for cp in range(0x00C0, 0x0250):
        ch = chr(cp)
        decomposed = unicodedata.normalize("NFKD", ch)
        base = "".join(c for c in decomposed if not unicodedata.combining(c))
        if len(base) == 1 and base != ch and base.isascii() and base.isalpha():
            src.append(ch)
            dst.append(base)
    # Apostrophes et accents isolés que les sources mélangent avec « ' ».
    for ch in ("’", "‘", "ʼ", "`", "´"):
        src.append(ch)
        dst.append("'")
    return "".join(src), "".join(dst)


ACCENT_SRC, ACCENT_DST = _build_accent_table()
_PY_TABLE = str.maketrans(ACCENT_SRC, ACCENT_DST)


def fold_text(value: str | None) -> str:
    """« Côte d’Ivoire » → « cote d'ivoire ». Même résultat que `fold_sql`."""
    if not value:
        return ""
    return value.translate(_PY_TABLE).lower().strip()


def fold_sql(column) -> ColumnElement:
    """Expression SQL équivalente à `fold_text` (Postgres, sans extension)."""
    return func.trim(func.lower(func.translate(func.coalesce(column, ""), ACCENT_SRC, ACCENT_DST)))
