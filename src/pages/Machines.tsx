import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import MachineCard from '../components/MachineCard';
import { categories, iconMap } from '../data/categories';
import type { Machine } from '../types';
import {
  MACHINES_CATALOG_INITIAL_LIMIT,
  MACHINES_CATALOG_MEMORY_CAP,
  MACHINES_CATALOG_STEP,
} from '../constants/machineQueryFields';
import { jobCategories } from '../data/jobcategories'; // ajout pour catégorie métier
import {
  chercherMachines,
  chargerFacettes,
  type Facette,
} from '../utils/api/catalogueRecherche';
import {
  classerCategorie,
  categoriesDuSecteur,
  categoriesDuGroupe,
  libelleVersSousType,
} from './catalogueClassement';

// Les tables de correspondance categorie -> groupe -> secteur vivent desormais
// dans ./catalogueClassement, pour etre appelables sur une simple chaine :
// c'est ce qui permet de traduire « secteur = Terrassement » en une liste de
// categories, et donc de filtrer COTE BASE au lieu du navigateur.

type MachineRow = {
  sellerid?: string | null;
  seller_id?: string | null;
  created_at?: string | null;
  year?: number | string | null;
  specifications?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type MachineWithCatalogMeta = Machine & {
  __jobSector?: string;
  __machineGroup?: string;
  __subcategoryId?: string;
  created_at?: string;
  year?: number | string;
  specifications?: {
    year?: number | string;
    [key: string]: unknown;
  };
};

function mapSupabaseRowToMachine(m: MachineRow): Machine {
  const specs = m.specifications || {};
  const fallbackLocation = [m.city, m.region, m.country].filter(Boolean).join(', ') || 'Localisation inconnue';
  // `MachineRow` porte un index de type `unknown` : on convertit explicitement
  // plutot que d'elargir la signature de classerCategorie, qui doit rester stricte.
  const classement = classerCategorie(
    (m.category as string | null | undefined) ?? null,
    (m.type as string | null | undefined) ?? null,
    (specs?.category_name as string | null | undefined) ?? null,
  );
  const normalizedCategory = classement.sousType;
  const machineGroup = classement.groupe;
  const machineType = classement.libelle;
  const jobSector = classement.secteur;
  const normalizedPower =
    specs?.power && typeof specs.power === 'object'
      ? specs.power
      : { value: specs?.engine_power || specs?.power || '', unit: 'kW' };
  return {
    ...m,
    seller: m.seller || { id: m.sellerid || m.seller_id || '', name: '', rating: 0, location: fallbackLocation },
    specifications: {
      dimensions: specs?.dimensions || '',
      weight: Number(specs?.weight || 0),
      workingWeight: Number(specs?.workingWeight || specs?.weight || 0),
      operatingCapacity: Number(specs?.operatingCapacity || 0),
      power: normalizedPower,
      ...specs,
    },
    type: machineType,
    __subcategoryId: normalizedCategory,
    __machineGroup: machineGroup,
    __jobSector: jobSector.toLowerCase(),
    price: typeof m.price === 'string' ? Number(m.price) || 0 : (m.price || 0),
  } as unknown as Machine;
}

interface MachinesProps {
  category?: string | null;
}

export default function Machines({ category }: MachinesProps) {
  const [isHashInitialized, setIsHashInitialized] = useState(false);
  const [hashKey, setHashKey] = useState(0);
useEffect(() => {
  const handleHashChange = () => {
    setHashKey(prev => prev + 1); // force relecture des params
  };
  window.addEventListener('hashchange', handleHashChange);
  return () => window.removeEventListener('hashchange', handleHashChange);
}, []);
  const [selectedJobCategory, setSelectedJobCategory] = useState<string>('');
  const [selectedMachineCategory, setSelectedMachineCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price' | 'date' | 'name'>('date');
  const [filterCondition, setFilterCondition] = useState<'all' | 'new' | 'used'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [hasMoreCatalog, setHasMoreCatalog] = useState(true);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');


  

  // L'ADRESSE EST LA SOURCE DE VERITE des filtres.
  //
  // Defaut corrige le 2026-09-29 : cet effet POSAIT les filtres presents dans
  // l'adresse mais n'EFFACAIT jamais les absents. Ouvrir un lien
  // « marque=Komatsu » alors qu'une recherche « Hitachi » etait en cours
  // gardait les deux, et l'ecran affichait « aucune annonce » sans que rien
  // n'explique pourquoi. Un lien partage doit ouvrir EXACTEMENT la selection
  // qu'il decrit, ni plus ni moins.
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1]);

    const cat = params.get('categorie');
    setSelectedJobCategory(cat && cat !== 'Tous secteurs' ? cat : '');

    setSelectedMachineCategory(params.get('machine') || '');

    const type = params.get('type');
    if (type) {
      const brut = type.toLowerCase();
      setSelectedType(libelleVersSousType[brut] || brut);
    } else {
      setSelectedType('');
    }

    setSearchTerm(params.get('search') || '');

    const condition = params.get('etat');
    setFilterCondition(
      condition === 'new' || condition === 'used' ? condition : 'all',
    );

    setSelectedBrand(params.get('marque') || '');
    setYearMin(params.get('anneeMin') || '');
    setYearMax(params.get('anneeMax') || '');
    setPriceMin(params.get('prixMin') || '');
    setPriceMax(params.get('prixMax') || '');

    const tri = params.get('tri');
    setSortBy(tri === 'price' || tri === 'name' ? tri : 'date');

    setIsHashInitialized(true);
  }, [hashKey]);
  
  
  // L'adresse du navigateur reflete les filtres, pour qu'un lien partage
  // rouvre exactement la meme selection.
  //
  // DEUX DEFAUTS CORRIGES ICI (2026-09-29) :
  //
  //  1. Seuls 5 des 10 filtres etaient ecrits dans l'adresse. Un client qui
  //     filtrait « Komatsu, a partir de 2018 » et envoyait le lien a un
  //     collegue : le collegue ne voyait ni Komatsu ni 2018.
  //  2. `window.location.hash = ...` ajoute une entree d'HISTORIQUE a chaque
  //     changement — donc a chaque lettre tapee. Ecrire « caterpillar »
  //     creait onze entrees, et le bouton « Retour » du navigateur ne
  //     ramenait plus a la page precedente. `replaceState` remplace l'entree
  //     courante au lieu d'en empiler une.
  useEffect(() => {
    if (!isHashInitialized) return;
    const params = new URLSearchParams();
    if (selectedJobCategory) params.set('categorie', selectedJobCategory);
    if (selectedMachineCategory) params.set('machine', selectedMachineCategory);
    if (selectedType) params.set('type', selectedType);
    if (searchTerm) params.set('search', searchTerm);
    if (filterCondition !== 'all') params.set('etat', filterCondition);
    if (selectedBrand) params.set('marque', selectedBrand);
    if (yearMin) params.set('anneeMin', yearMin);
    if (yearMax) params.set('anneeMax', yearMax);
    if (priceMin) params.set('prixMin', priceMin);
    if (priceMax) params.set('prixMax', priceMax);
    if (sortBy !== 'date') params.set('tri', sortBy);
    const cible = `#machines?${params.toString()}`;
    if (window.location.hash !== cible) {
      window.history.replaceState(null, '', cible);
    }
  }, [
    selectedJobCategory,
    selectedMachineCategory,
    selectedType,
    searchTerm,
    filterCondition,
    selectedBrand,
    yearMin,
    yearMax,
    priceMin,
    priceMax,
    sortBy,
    isHashInitialized,
  ]);

  // --------------------------------------------------------------------------
  // CHARGEMENT : c'est la BASE qui filtre, plus le navigateur.
  //
  // Avant le 2026-09-29, cette page telechargeait les 400 annonces les plus
  // recentes (3 000 au maximum) puis filtrait, cherchait et triait en memoire.
  // Sur 16 397 annonces en base, cela rendait 82 % du catalogue introuvable :
  // chercher « Hitachi » n'affichait rien alors que 113 Hitachi etaient en
  // vente, et le menu « Marque » proposait 44 marques sur 449.
  //
  // Desormais chaque critere part dans la requete. On ne telecharge que ce qui
  // correspond, et `totalTrouve` dit combien il y en a EN TOUT.
  // --------------------------------------------------------------------------

  /** Listes completes des marques et categories, fournies par la base (migration p33). */
  const [facettes, setFacettes] = useState<{ marques: Facette[]; categories: Facette[] } | null>(null);
  /** Nombre total d'annonces correspondant aux criteres, tous chargements confondus. */
  const [totalTrouve, setTotalTrouve] = useState<number | null>(null);
  /** Faux tant que la migration p33 n'est pas appliquee : le prix reste filtre en memoire. */
  const [prixCoteBase, setPrixCoteBase] = useState(true);

  useEffect(() => {
    let annule = false;
    void chargerFacettes().then((f) => {
      if (!annule) setFacettes(f);
    });
    return () => {
      annule = true;
    };
  }, []);

  /**
   * Categories brutes de la base concernees par le secteur / le groupe choisi.
   *
   * On traduit un libelle de secteur en liste de categories reelles, parce que
   * la base ne connait pas la notion de « secteur » : elle ne connait que la
   * colonne `category`. Sans les facettes (migration non appliquee), on se
   * rabat sur les categories des annonces deja chargees.
   */
  const categoriesConnues = useMemo(() => {
    if (facettes?.categories?.length) return facettes.categories.map((c) => c.valeur);
    return Array.from(
      new Set(machines.map((m) => String((m as MachineWithCatalogMeta).category || '')).filter(Boolean)),
    );
  }, [facettes, machines]);

  const categoriesFiltrees = useMemo(() => {
    const parSecteur = categoriesDuSecteur(categoriesConnues, selectedJobCategory);
    const parGroupe = categoriesDuGroupe(categoriesConnues, selectedMachineCategory || selectedType);
    if (parSecteur.length && parGroupe.length) {
      // Les deux filtres sont poses : on garde l'intersection.
      const dansGroupe = new Set(parGroupe);
      return parSecteur.filter((c) => dansGroupe.has(c));
    }
    return parSecteur.length ? parSecteur : parGroupe;
  }, [categoriesConnues, selectedJobCategory, selectedMachineCategory, selectedType]);

  /** Les criteres tels qu'ils partiront a la base. */
  const criteres = useMemo(
    () => ({
      recherche: searchTerm,
      marque: selectedBrand,
      categories: categoriesFiltrees,
      etat: filterCondition,
      anneeMin: yearMin,
      anneeMax: yearMax,
      prixMin: priceMin,
      prixMax: priceMax,
      tri: (sortBy === 'price' ? 'price-asc' : sortBy === 'name' ? 'name' : 'recent') as
        | 'recent'
        | 'price-asc'
        | 'name',
    }),
    [
      searchTerm,
      selectedBrand,
      categoriesFiltrees,
      filterCondition,
      yearMin,
      yearMax,
      priceMin,
      priceMax,
      sortBy,
    ],
  );

  // Cle stable des criteres : evite de relancer une requete identique a chaque
  // rendu, et sert de dependance unique a l'effet ci-dessous.
  const cleCriteres = JSON.stringify(criteres);

  useEffect(() => {
    let annule = false;
    setLoading(true);

    // On attend 300 ms avant d'interroger la base : sans cela, taper
    // « caterpillar » declencherait onze requetes.
    const minuteur = setTimeout(() => {
      void (async () => {
        const taille = Math.min(MACHINES_CATALOG_INITIAL_LIMIT, MACHINES_CATALOG_MEMORY_CAP);
        const page = await chercherMachines(criteres, 0, taille);
        if (annule) return;
        setPrixCoteBase(page.prixCoteBase);
        setTotalTrouve(page.total);
        if (page.erreur) {
          console.error('[Machines] Erreur chargement machines :', page.erreur);
          setMachines([]);
          setHasMoreCatalog(false);
        } else {
          setMachines(page.lignes.map((m) => mapSupabaseRowToMachine(m as MachineRow)) as Machine[]);
          setCatalogOffset(page.lignes.length);
          setHasMoreCatalog(
            page.lignes.length === taille && page.lignes.length < MACHINES_CATALOG_MEMORY_CAP,
          );
        }
        setLoading(false);
      })();
    }, 300);

    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
    // `criteres` est reconstruit a chaque rendu ; c'est `cleCriteres` qui dit
    // s'il a REELLEMENT change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleCriteres]);

  const loadMoreCatalog = async () => {
    if (!hasMoreCatalog || loadingMore || loading) return;
    const restant = MACHINES_CATALOG_MEMORY_CAP - catalogOffset;
    if (restant <= 0) {
      setHasMoreCatalog(false);
      return;
    }
    setLoadingMore(true);
    try {
      const taille = Math.min(MACHINES_CATALOG_STEP, restant);
      // Meme criteres : la suite porte sur les annonces FILTREES, pas sur le
      // catalogue entier comme auparavant.
      const page = await chercherMachines(criteres, catalogOffset, taille);
      if (page.erreur) {
        console.error('Erreur chargement machines (suite) :', page.erreur);
      } else if (page.lignes.length) {
        const ajout = page.lignes.map((m) => mapSupabaseRowToMachine(m as MachineRow)) as Machine[];
        setMachines((prev) => [...prev, ...ajout]);
        const suivant = catalogOffset + page.lignes.length;
        setCatalogOffset(suivant);
        setHasMoreCatalog(
          page.lignes.length === taille && suivant < MACHINES_CATALOG_MEMORY_CAP,
        );
      } else {
        setHasMoreCatalog(false);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Marques proposees dans le filtre.
   *
   * Elles viennent de la BASE (migration p33) : les 449 marques reelles, avec
   * leur nombre d'annonces. Auparavant elles etaient deduites des seules
   * annonces telechargees, ce qui n'en montrait que 44 sur 449 — Hitachi,
   * Hyundai, Doosan et 329 autres n'apparaissaient jamais dans le menu.
   *
   * Repli si la migration n'est pas encore appliquee : l'ancien comportement,
   * pour que la page continue de fonctionner.
   */
  const availableBrands = useMemo(() => {
    if (facettes?.marques?.length) {
      return facettes.marques.map((m) => m.valeur);
    }
    const vues = new Map<string, string>();
    for (const m of machines) {
      const brut = (m.brand || '').trim();
      if (!brut) continue;
      const cle = brut.toLowerCase();
      if (!vues.has(cle)) vues.set(cle, brut);
    }
    return Array.from(vues.values()).sort((a, b) => a.localeCompare(b));
  }, [facettes, machines]);

  /**
   * Les annonces a afficher.
   *
   * La base a DEJA applique tous les criteres : recherche, marque, categorie,
   * secteur, etat, annee, et le prix des lors que la migration p33 est en
   * place. Il ne reste donc rien a filtrer ici.
   *
   * Le bloc precedent — 95 lignes — refaisait le travail dans le navigateur,
   * sur les seules annonces telechargees. Il contenait aussi un piege :
   * une variable `noFilters` enumerait A LA MAIN les dix filtres et, si tous
   * etaient vides, court-circuitait tous les tests. Ajouter un onzieme filtre
   * sans l'inscrire dans cette liste donnait un filtre qui s'affichait, se
   * cliquait, et ne filtrait rien — sans aucune erreur. Le piege disparait
   * avec le filtrage en memoire.
   */
  const filteredMachines = useMemo(() => {
    if (prixCoteBase) return machines;
    // Migration p33 pas encore appliquee : `price` est stocke en texte et la
    // base ne sait pas le comparer. On applique donc ce seul critere ici, sur
    // la page en cours. C'est une limite ASSUMEE et temporaire, signalee a
    // l'utilisateur par le bandeau de resultats.
    const min = priceMin ? parseFloat(priceMin) : null;
    const max = priceMax ? parseFloat(priceMax) : null;
    if (min === null && max === null) return machines;
    return machines.filter((m) => {
      const prix = Number(m.price) || 0;
      return (min === null || prix >= min) && (max === null || prix <= max);
    });
  }, [machines, prixCoteBase, priceMin, priceMax]);

  /**
   * Tri.
   *
   * Il est fait par la base (`order by`) dans tous les cas sauf un : le tri
   * par prix quand la migration p33 manque. La base trierait alors sur du
   * TEXTE, et « 1 250 000 » passerait avant « 95 000 ». On retrie donc la page
   * en memoire dans ce seul cas.
   */
  const sortedMachines = useMemo(() => {
    if (sortBy === 'price' && !prixCoteBase) {
      return [...filteredMachines].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    }
    return filteredMachines;
  }, [filteredMachines, sortBy, prixCoteBase]);


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <div className="flex items-center text-sm text-gray-500 mb-4">
          <a href="#" className="hover:text-primary-600">Accueil</a>
          <ChevronRight className="h-4 w-4 mx-2" />
          <span className="text-gray-900">Machines</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          {/* Filtres */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-white rounded-lg shadow-md p-3">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Filtres</h3>
              <div className="space-y-3">
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Secteur</label>
                  <select
                    value={selectedJobCategory}
                    onChange={(e) => setSelectedJobCategory(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="Tous secteurs">Tous les secteurs</option>
                    {jobCategories.map((cat) => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>

                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Machines</label>
                  <select
  value={selectedMachineCategory}
  onChange={(e) => setSelectedMachineCategory(e.target.value)}
  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
>
  <option value="">Toutes les machines</option>
  {categories.map(cat => (
    <option key={cat.id} value={cat.name}>{cat.name}</option>
  ))}
</select>


                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                  <select
  value={selectedType}
  onChange={(e) => setSelectedType(e.target.value)}
  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
>
  <option value="">Tous les types</option>
  <option value="Tous secteurs">Tous les secteurs</option>
  {categories
    .find(cat => cat.name === selectedMachineCategory)
    ?.subcategories?.map(sub => (
      <option key={sub.id} value={sub.id}>{sub.name}</option>
    ))}
</select>


                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Marque
                  </label>
                  <select
  value={selectedBrand}
  onChange={(e) => setSelectedBrand(e.target.value)}
  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
>
  <option value="">Toutes les marques</option>
  {availableBrands.length === 0 ? (
    <option value="" disabled>(aucune marque détectée)</option>
  ) : (
    availableBrands.map((brand) => (
      <option key={brand} value={brand}>{brand}</option>
    ))
  )}
</select>

                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Année
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      type="number"
                      placeholder="Min"
                      value={yearMin}
                      onChange={(e) => setYearMin(e.target.value)}
                      min={1950}
                      max={new Date().getFullYear() + 1}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-md"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={yearMax}
                      onChange={(e) => setYearMax(e.target.value)}
                      min={1950}
                      max={new Date().getFullYear() + 1}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
  <label className="block text-xs font-medium text-gray-700 mb-1">Prix (€)</label>
  <div className="grid grid-cols-2 gap-1">
    <input
      type="number"
      placeholder="Min"
      value={priceMin}
      onChange={(e) => setPriceMin(e.target.value)}
      className="px-2 py-1 text-sm border border-gray-300 rounded-md"
    />
    <input
      type="number"
      placeholder="Max"
      value={priceMax}
      onChange={(e) => setPriceMax(e.target.value)}
      className="px-2 py-1 text-sm border border-gray-300 rounded-md"
    />
  </div>
</div>

              </div>
            </div>
          </div>

          {/* Résultats */}
          <div className="md:col-span-5">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Toutes les machines</h1>
                  {/* Le compte vient de la BASE, pas du nombre de cartes affichees.
                      C'est ce qui permet d'annoncer « 113 annonces » quand on en
                      montre 20 — et c'est la preuve visible que la recherche
                      porte bien sur les 16 397 annonces et non sur les 400
                      telechargees. */}
                  {!loading && totalTrouve !== null && (
                    <p className="mt-1 text-sm text-gray-600">
                      {totalTrouve === 0
                        ? 'Aucune annonce ne correspond'
                        : `${totalTrouve.toLocaleString('fr-FR')} annonce${totalTrouve > 1 ? 's' : ''} ${
                            totalTrouve > 1 ? 'correspondent' : 'correspond'
                          }`}
                      {totalTrouve > sortedMachines.length &&
                        ` — ${sortedMachines.length} affichée${sortedMachines.length > 1 ? 's' : ''}`}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-0 sm:items-center">
                  <div className="relative w-full sm:w-auto">
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full"
                    />
                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'price' | 'date' | 'name')}
                    className="px-4 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="date">Plus récent</option>
                    <option value="price">Prix croissant</option>
                    <option value="name">Nom A-Z</option>
                  </select>
                </div>
              </div>

              {/* Grille des machines */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                  <p className="text-center col-span-full text-gray-500">Chargement...</p>
                ) : filteredMachines.length === 0 ? (
                  <div className="text-center col-span-full space-y-3 text-gray-500">
                    <p>
                      {machines.length === 0
                        ? 'Aucune annonce disponible pour le moment.'
                        : 'Aucune annonce ne correspond à ces critères. Essayez une autre marque, une autre période, ou élargissez la recherche.'}
                    </p>
                    {machines.length === 0 && (
                      <p className="text-xs text-gray-400 max-w-md mx-auto">
                        Revenez d'ici quelques jours — de nouvelles machines sont
                        ajoutées régulièrement par nos vendeurs partenaires.
                      </p>
                    )}
                    {machines.length > 0 && hasMoreCatalog && (
                      <p className="text-sm text-gray-400">
                        Essayez d'élargir les filtres ou chargez d'autres annonces ci-dessous.
                      </p>
                    )}
                    {hasMoreCatalog && !loading && (
                      <button
                        type="button"
                        onClick={() => void loadMoreCatalog()}
                        disabled={loadingMore}
                        className="px-5 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                      >
                        {loadingMore ? 'Chargement…' : 'Charger plus d’annonces'}
                      </button>
                    )}
                  </div>
                ) : (
                  sortedMachines.map((machine: Machine) => (
                    <MachineCard key={machine.id} machine={machine} />
                  ))
                )}
              </div>

              {hasMoreCatalog && !loading && sortedMachines.length > 0 && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadMoreCatalog()}
                    disabled={loadingMore}
                    className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {loadingMore
                      ? 'Chargement…'
                      : `Charger plus (${machines.length} / ${MACHINES_CATALOG_MEMORY_CAP} max.)`}
                  </button>
                  <p className="text-xs text-gray-400 text-center max-w-md">
                    Le catalogue se charge par blocs pour garder le site fluide avec de nombreux
                    utilisateurs.
                  </p>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
