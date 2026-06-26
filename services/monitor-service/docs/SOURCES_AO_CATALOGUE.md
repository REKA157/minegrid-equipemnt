# Catalogue des sources d'AO + attributions par pays (vérifié en direct, 2026-06-26)

Recherche multi-agents (6 régions) avec vérification WebFetch/WebSearch. Objectif : compléter
World Bank avec d'autres sources officielles, en priorisant **les attributions (gagnants)** et le
**format structuré** (OCDS/API > HTML scraping).

## TIER 1 — OCDS structuré (tenders + AWARDS + gagnants, JSON) → connecteur `ocds_feed` (après upgrade)

Point d'entrée central : **OCP Data Registry** `https://data.open-contracting.org/en/publications.json`
(liste machine des publishers ; chaque pays expose un bulk `.jsonl.gz` à
`/en/publication/{id}/download?name=full.jsonl.gz`, en OCDS avec awards).

| Pays | Source | URL | Attributions | Notes |
|---|---|---|---|---|
| **Tanzanie** | PPRA NeST | `data.nest.go.tz/ocds` (registre pub/152) | **~308 000** | Le + gros volume, MAJ quotidienne |
| **Kenya** | PPRA PPIP | `tenders.go.ke/ocds` (pub/147, bulk pub/13) | ~107 000 | MAJ quotidienne, 47 comtés |
| **Ouganda** | PPDA GPP | `gpp.ppda.go.ug/public/open-data/ocds/ocds-datasets` (pub/130) | ~65 600 | dernière donnée jan-2025 (migration EGP) |
| **Rwanda** | RPPA Umucyo | `ocds.umucyo.gov.rw/OpenData` (pub/145) | ~52 900 | API REST Swagger + bulk, depuis 2013 |
| **Zambie** | ZPPA | `zppa.org.zm/record-packages` (pub/3) | ~23 600 | actif (juin 2026) |
| **Nigeria** | BPP/NOCOPO | registre pub/64 (ou 37/102/105) | ~17 400 | bulk JSONL propre |
| **Ghana** | PPA GHANEPS | registre pub/85 | ~9 650 | OCDS natif + page awards HTML |
| **Afrique du Sud** | Treasury eTenders | `ocds-api.etenders.gov.za/api/OCDSReleases` (pub/143) | API live | pagination dateFrom/dateTo |
| **Ukraine** | Prozorro | `public-api.prozorro.gov.ua/api/2.5/tenders?opt_schema=ocds` (pub/154) | énorme | OCDS exemplaire, temps réel |
| **France** | DECP | registre pub/23 (`full.jsonl.gz`) | **519 020** | OCDS officiel DINUM |
| **Italie** | ANAC | registre pub/117 | ~334 000 | bulk JSONL, CC-BY |
| **Pays-Bas** | TenderNed | registre pub/71 | ~141 000 | OCDS depuis 2016 |
| **Royaume-Uni** | Find a Tender | `find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=award` | API live | OCDS 1.1, awards |
| **Allemagne** | oeffentlichevergabe.de | API open data (OCDS + eForms) | oui | endpoint Swagger à fixer |
| **Portugal** | BASE/IMPIC | bulk OCDS sur `dados.gov.pt` | oui | bulk ouvert (API IMPIC = autorisation) |
| **Repli Europe** | OpenTender.eu | registre pub/150 | 2,47 M | ⚠️ non officiel + licence NonCommercial |

## TIER 2 — TED (toute l'UE en une API) → petit connecteur dédié
- `https://api.ted.europa.eu/v3/notices/search` — **POST JSON, sans clé**, couvre 27 pays UE+EEE avec
  les **avis d'attribution** (eForms). Filtrer CPV `45000000` (travaux/génie civil), `43000000` (engins).
  Sortie eForms/XML → mapping vers notre schéma (pas OCDS natif). **Une intégration = quasi toute l'Europe.**
- France BOAMP (complément) : `boamp-datadila.opendatasoft.com/api/explore/v2.1/...` `where=nature=ATTRIBUTION`
  (REST-JSON, 458k avis, gagnant+montant) — vérifié live.

## TIER 3 — Portails HTML nationaux (gagnants publiés) → connecteur `public_portals` (scraping)
| Pays | Portail | URL | Attributions |
|---|---|---|---|
| **Maroc** | PMMP (TGR) | `marchespublics.gov.ma/pmmp` → « Résultats définitifs » | oui (gros volume BTP) |
| **Tunisie** | HAICOP | `marchespublics.gov.tn/fr/resultats` | oui (détail dans la fiche) |
| **Niger** | ARCOP/SIGMAP | `marchespublics.ne` | oui (gagnants nommés) |
| **Guinée** | ARMP | `armpguinee.org/appels-doffres` | oui (+ PDF/XLS) |
| **Cameroun** | ARMP | `armp.cm/filtres?type=avis&val=4` | oui (gagnant + montant FCFA) |
| **RDC** | ARMP SIGMAP | `marchepublic.cd` | oui (provisoire + définitif) |
| **Mozambique** | UFSA | `ufsa.gov.mz/adjudicacoes.php` | oui (PDF par marché) |
| **Malawi** | PPDA | `ppda.mw/tenders` + « Award Notices » | oui |
| **Bénin** | DNCMP | `marches-publics.bj` (RSS en footer) | oui (PV attribution) |
| **Grèce** | KIMDIS | `cerpp.eprocurement.gov.gr/khmdhs-opendata` (REST JSON) | oui (Anatheseis) |
| **Qatar** | Monaqasat | `monaqasat.mof.gov.qa` « Awarded Tenders » | oui |
| **Oman** | Tender Board | `etendering.tenderboard.gov.om/product/publicDash` | oui (30 295) |
| **Liban** | PPA | `ppa.gov.lb` « résultats d'évaluation » | oui |
| **Bahreïn** | Tender Board | `tenderboard.gov.bh/Tenders/AwardedTenders` | oui (**PDF** mensuels) |

## Difficiles / bloqués / sans source
- **Login obligatoire** : Arabie Saoudite (Etimad), EAU (DPP/eSupply), Jordanie (JONEPS, SPA), TUNEPS, Koweït (CAPT, anti-bot).
- **Géo-bloqués au test** (à re-tester depuis une autre IP) : Algérie (`marches-publics.gov.dz`), Égypte (`etenders.gov.eg`), Sénégal (`marchespublics.sn`).
- **Aucune source officielle trouvée** : Libye, Irak (fédéral), Turquie (EKAP sans API ouverte).
- **SPA JS** (scraping simple insuffisant, rendu headless requis) : Éthiopie eGP, Madagascar, COLEPS Cameroun, SIGOMAP CI.

## Upgrade nécessaire du connecteur `ocds_feed`
L'actuel ignore les **awards/gagnants**, ne lit qu'une page JSON (`links.next`) et jette les budgets non-USD.
À ajouter pour exploiter le Tier 1 :
1. Extraction `release.awards[]` → phase `awarded` + **fournisseur gagnant** (→ `raw.awarded_supplier` pour
   `materialize_contacts`), + `buyer` → maître d'ouvrage.
2. Support **bulk `.jsonl.gz`** (gzip + JSON Lines) en plus des API paginées.
3. Conversion devise → USD (réutiliser `wb_procurement.value_to_usd`).
4. Filtre pertinence (déjà à l'upsert) + focalisation marchés cibles.
