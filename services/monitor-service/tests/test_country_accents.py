"""Pays comparés sans accents ni casse (filtre /projects et évaluateur d'alertes).

Constaté le 2026-10-01 : la Banque mondiale stocke « Cote d'Ivoire », les
portails francophones « Côte d'Ivoire ». L'égalité stricte faisait disparaître
une partie des projets selon la source. L'exécution SQL réelle est prouvée par
tests/test_integration_postgres.py (Postgres jetable) ; ici on vérifie la
normalisation et la requête produite.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.alerts.evaluator import evaluate_rule
from app.models import Project
from app.text_fold import ACCENT_DST, ACCENT_SRC, fold_sql, fold_text


def _project(**kw) -> Project:
    p = Project()
    defaults = {"title": "Mine d'or", "type": "mine", "phase": "construction",
                "country": "Senegal", "budget_usd": Decimal("1000000")}
    defaults.update(kw)
    for k, v in defaults.items():
        setattr(p, k, v)
    return p


def test_fold_text_neutralise_accents_casse_et_apostrophes():
    attendu = "cote d'ivoire"
    for variante in ("Côte d'Ivoire", "Cote d'Ivoire", "CÔTE D’IVOIRE", "  côte d'ivoire "):
        assert fold_text(variante) == attendu
    assert fold_text("Sénégal") == fold_text("SENEGAL") == "senegal"
    assert fold_text("São Tomé-et-Príncipe") == "sao tome-et-principe"
    assert fold_text(None) == ""


def test_table_sql_coherente():
    # translate() exige des chaînes de même longueur pour un remplacement 1-1.
    assert len(ACCENT_SRC) == len(ACCENT_DST)
    assert len(set(ACCENT_SRC)) == len(ACCENT_SRC)
    for src, dst in zip(ACCENT_SRC, ACCENT_DST):
        assert dst.isascii()
        assert fold_text(src) == dst.lower()


def test_regle_cote_d_ivoire_trouve_les_projets_banque_mondiale():
    regle = {"country": ["Côte d'Ivoire"]}
    assert evaluate_rule(regle, _project(country="Cote d'Ivoire")) is True
    assert evaluate_rule(regle, _project(country="CÔTE D’IVOIRE")) is True
    assert evaluate_rule(regle, _project(country="Côte d'Ivoire")) is True
    assert evaluate_rule(regle, _project(country="Senegal")) is False
    assert evaluate_rule(regle, _project(country=None)) is False


def test_regle_sans_accent_trouve_le_projet_accentue():
    assert evaluate_rule({"country": ["Senegal"]}, _project(country="Sénégal")) is True


def test_mots_cles_sans_accents():
    assert evaluate_rule({"keywords": ["equipement"]}, _project(title="Équipement minier")) is True
    assert evaluate_rule({"keywords": ["kedougou"]}, _project(title="Mine de Kédougou")) is True
    assert evaluate_rule({"keywords": ["port"]}, _project(title="Mine de Kédougou")) is False


def test_mot_cle_vide_ne_fait_plus_correspondre_tout_projet():
    # « mine, » saisi avec une virgule finale donnait ["mine", ""] : "" est dans
    # tout titre, la règle correspondait à TOUT projet.
    assert evaluate_rule({"keywords": ["mine", ""]}, _project(title="Autoroute")) is False
    # Seulement des mots-clés vides : condition ignorée (comme une liste vide).
    assert evaluate_rule({"keywords": [""]}, _project(title="Autoroute")) is True


def test_requete_sql_compare_sans_accents_sans_extension():
    stmt = select(Project.id).where(fold_sql(Project.country) == fold_text("Côte d'Ivoire"))
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "translate(" in sql and "lower(" in sql
    assert "unaccent" not in sql  # extension absente de la base du radar
    compiled = stmt.compile(dialect=postgresql.dialect())
    assert "cote d'ivoire" in compiled.params.values()
