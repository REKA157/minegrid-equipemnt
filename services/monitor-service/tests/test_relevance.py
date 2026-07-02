"""Tests du filtre de pertinence engins/BTP (echantillons reels de la base)."""
from app.ingestion.relevance import is_equipment_relevant


def test_rejette_hors_sujet():
    assert not is_equipment_relevant("Achat de fournitures pour matériels informatique")
    assert not is_equipment_relevant("Services d'assurance")
    assert not is_equipment_relevant("Produits chimiques, de nettoyage, insecticides")
    assert not is_equipment_relevant("ENTRETIEN ET MAINTENANCE DE LOGICIEL DE GESTION DES DONNEES")
    assert not is_equipment_relevant("Achat de mobilier de bureau au profit de la représentation")
    assert not is_equipment_relevant("Mise en place d'un réseau informatique et serveurs")
    assert not is_equipment_relevant("")
    assert not is_equipment_relevant(None)


def test_rejette_fragments_non_ao():
    # Bruit de scraping (actualites / noms) : aucun signal materiel -> rejete.
    assert not is_equipment_relevant("VISITE D'UNE DELEGATION DE LA BANQUE MONDIALE A L'ARCOP")
    assert not is_equipment_relevant("Informations pratiques")
    assert not is_equipment_relevant("M. BROU Yao Paul Directeur de la Formation")


def test_garde_pertinents():
    assert is_equipment_relevant("Construction d'une route reliant X a Y")
    assert is_equipment_relevant("Travaux de terrassement et VRD")
    assert is_equipment_relevant("Fourniture d'engins de chantier")
    assert is_equipment_relevant("Rehabilitation du barrage de Diama")
    assert is_equipment_relevant("Marche de genie civil pour un pont")
    assert is_equipment_relevant("Exploitation miniere : decapage et extraction")


def test_rejette_hors_sujet_anglais():
    # Cas reels World Bank : materiel medical / IT / mobilier / services -> rejetes.
    assert not is_equipment_relevant("Procurement of Medical equipment and Medical furniture")
    assert not is_equipment_relevant("Supply and installation of computer software and laptops")
    assert not is_equipment_relevant("Supply of office furniture and stationery")
    assert not is_equipment_relevant("Consultancy services for project supervision and training")
    # Le garde-fou : 'installation' (mot faible) ne sauve pas un marche medical.
    assert not is_equipment_relevant("Supply, delivery and installation of hospital medical devices")


def test_garde_pertinents_anglais():
    assert is_equipment_relevant("Borehole Drilling Works in the northern region")
    assert is_equipment_relevant("Civil works for road rehabilitation")
    assert is_equipment_relevant("Construction of a science laboratory building")
    assert is_equipment_relevant("Improvement of the power supply system: construction of power lines")
    assert is_equipment_relevant("Earthworks and excavation for the new dam")


def test_raw_text_pris_en_compte():
    # Titre pauvre mais texte source clair -> garde.
    assert is_equipment_relevant("Avis n123", {"source_text": "travaux de construction d'une autoroute"})
