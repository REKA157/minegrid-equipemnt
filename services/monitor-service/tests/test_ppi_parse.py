import asyncio
import os
import tempfile
from pathlib import Path

import pytest

from app.ingestion.connectors.ppi import PPIConnector


# Constaté le 2026-10-01 : trois tests échouaient, pour DEUX raisons d'environnement
# de test, pas de défaut du connecteur :
#   1) « There is no current event loop in thread 'MainThread' » :
#      asyncio.get_event_loop() dépend de l'état global laissé par les tests
#      précédents (asyncio.run() remet la boucle courante à None en sortant).
#      Chaque test crée désormais sa propre boucle avec asyncio.run().
#   2) masqué par le 1) : le CSV temporaire était écrit dans /tmp, que le
#      connecteur refuse VOLONTAIREMENT (protection contre la traversée de
#      chemin : seuls les fichiers sous le dossier du service sont lus). Le CSV
#      est désormais écrit dans data/ du service, puis supprimé.
#   3) masqué par les deux autres : la ligne censée avoir un titre VIDE portait
#      le texte « Empty Title » dans la colonne titre (et une colonne de moins).
#      Le connecteur écarte bien les lignes sans titre ; la donnée de test
#      contredisait l'intention du test. La ligne a désormais un titre vide et
#      des autres champs remplis : on vérifie que c'est le titre seul qui l'écarte.
SERVICE_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = SERVICE_ROOT / "data"


@pytest.fixture
def csv_path():
    DATA_DIR.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, encoding="utf-8", dir=DATA_DIR,
        prefix="test_ppi_",
    ) as f:
        f.write(SAMPLE_CSV)
        path = f.name
    yield path
    os.remove(path)

SAMPLE_CSV = """project_name,country,region,sector,status,total_investment,financial_closure,url
Mine d'or Test,Senegal,Kédougou,Energy,Active,350000000,2025-06-01,https://example.com
Autoroute Test,Ghana,Accra,Transport,Construction,820000000,2026-01-15,https://example.com
,Mali,Bamako,Energy,Active,100000000,2025-01-01,https://example.com
Barrage Test,Cameroon,Centre,Water,Operational,680000000,2023-01-01,https://example.com
"""


def test_ppi_parse_count(csv_path):
    connector = PPIConnector(config={"file_path": csv_path})
    assets = asyncio.run(connector.fetch())

    # La ligne au titre vide (Mali) doit être écartée
    assert len(assets) == 3


def test_ppi_parse_fields(csv_path):
    connector = PPIConnector(config={"file_path": csv_path})
    assets = asyncio.run(connector.fetch())

    mine = assets[0]
    assert mine.title == "Mine d'or Test"
    assert mine.country == "Senegal"
    assert mine.source == "PPI Database"


def test_ppi_type_mapping():
    assert PPIConnector._map_type("Transport") == "road"
    assert PPIConnector._map_type("Energy") == "energy"
    assert PPIConnector._map_type("Water") == "dam"
    assert PPIConnector._map_type("Unknown") == "infrastructure"


def test_ppi_phase_mapping():
    assert PPIConnector._map_phase("Construction") == "construction"
    assert PPIConnector._map_phase("Operational") == "ops"
    assert PPIConnector._map_phase("Cancelled") == "study"
    assert PPIConnector._map_phase("Active") == "financing"


def test_ppi_country_filter(csv_path):
    connector = PPIConnector(config={"file_path": csv_path, "country_filter": ["SENEGAL"]})
    assets = asyncio.run(connector.fetch())

    assert len(assets) == 1
    assert assets[0].country == "Senegal"


def test_fichier_hors_du_dossier_du_service_refuse(tmp_path):
    """Protection volontaire : c'est elle qui faisait échouer les tests écrivant dans /tmp."""
    outside = tmp_path / "ppi.csv"
    outside.write_text(SAMPLE_CSV, encoding="utf-8")
    assert asyncio.run(PPIConnector(config={"file_path": str(outside)}).fetch()) == []


def test_dossier_voisin_au_prefixe_identique_refuse(caplog):
    """« /app2/x.csv » commençait par « /app » : l'ancienne comparaison de préfixe l'acceptait.

    Le fichier n'a pas besoin d'exister : le contrôle de chemin passe AVANT le
    test d'existence. On vérifie que c'est bien le contrôle de chemin qui refuse
    (et non « fichier introuvable »), sans rien écrire hors du dépôt.
    """
    sibling = SERVICE_ROOT.parent / (SERVICE_ROOT.name + "-voisin") / "ppi.csv"
    with caplog.at_level("WARNING"):
        assert asyncio.run(PPIConnector(config={"file_path": str(sibling)}).fetch()) == []
    assert "Path traversal blocked" in caplog.text
    assert "PPI file not found" not in caplog.text
