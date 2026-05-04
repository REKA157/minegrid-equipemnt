import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import MachineCard from '../components/MachineCard';
import { categories, iconMap } from '../data/categories';
import type { Machine } from '../types';
import supabase from '../utils/supabaseClient';
import {
  MACHINE_LIST_COLUMNS,
  MACHINES_CATALOG_INITIAL_LIMIT,
  MACHINES_CATALOG_MEMORY_CAP,
  MACHINES_CATALOG_STEP,
} from '../constants/machineQueryFields';
import { jobCategories } from '../data/jobcategories'; // ajout pour catégorie métier
import { DEFAULT_JOB_SECTOR, GROUP_TO_JOB_SECTOR } from '../data/sectors';

const subtypeToGroupName = new Map<string, string>();
const subtypeToLabel = new Map<string, string>();
categories.forEach((group) => {
  (group.subcategories || []).forEach((sub) => {
    subtypeToGroupName.set(String(sub.id || '').toLowerCase(), String(group.name || '').toLowerCase());
    subtypeToLabel.set(String(sub.id || '').toLowerCase(), String(sub.name || ''));
  });
});

const mascusCategoryAliases: Record<string, string> = {
  crawlerexcavators: 'pelle-chenilles',
  wheeledexcavators: 'pelle-pneus',
  wheelloaders: 'chargeuse-pneus',
  backhoeloaders: 'chargeuse-pelleteuse',
  dozers: 'bulldozer',
  motorgraders: 'niveleuse',
  dumptrucks: 'camion-benne',
  articulateddumptrucks: 'camion-benne',
  rigiddumptrucks: 'tombereau-rigide',
  singledrumrollers: 'compacteur-monocylindre',
  tandemrollers: 'compacteur-tandem',
  forklifts: 'chariot-elevateur',
  telehandlers: 'telescopique',
  asphaltpavers: 'finisseur',
  generators: 'groupe-electrogene',
  compressors: 'compresseur',
  concretemixers: 'camion-melangeur',
  crushers: 'concasseur',
  screeners: 'crible',
  drillingrigs: 'foreuse',
  tractors: 'tracteur-routier',
};

const labelToSubtypeId: Record<string, string> = {};
categories.forEach((group) => {
  (group.subcategories || []).forEach((sub) => {
    labelToSubtypeId[String(sub.name || '').toLowerCase()] = String(sub.id || '').toLowerCase();
  });
});

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
  const rawCategoryId = String(m.category || '').toLowerCase();
  const rawType = String(m.type || '').toLowerCase();
  const rawCategoryName = String(specs?.category_name || '').toLowerCase();

  const compactCategory = rawCategoryId.replace(/[\s_-]/g, '');
  const compactCategoryName = rawCategoryName.replace(/[\s_-]/g, '');

  let normalizedCategory =
    mascusCategoryAliases[compactCategory] ||
    mascusCategoryAliases[compactCategoryName] ||
    rawCategoryId;

  if (!subtypeToGroupName.has(normalizedCategory)) {
    const fromTypeLabel = labelToSubtypeId[rawType];
    const fromCategoryLabel = labelToSubtypeId[rawCategoryId];
    normalizedCategory = fromTypeLabel || fromCategoryLabel || normalizedCategory;
  }

  const machineGroup = subtypeToGroupName.get(normalizedCategory) || '';
  const machineType = subtypeToLabel.get(normalizedCategory) || m.type || m.category || '';
  const jobSector = GROUP_TO_JOB_SECTOR[machineGroup] || DEFAULT_JOB_SECTOR;
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
  } as Machine;
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


  

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1]);
  
    const cat = params.get('categorie');
    const machineCat = params.get('machine');
    const type = params.get('type');
    const search = params.get('search');
    const condition = params.get('etat');
  
    if (cat && cat !== 'Tous secteurs') {
      setSelectedJobCategory(cat);
    } else {
      setSelectedJobCategory('');
    }
  
    if (machineCat) setSelectedMachineCategory(machineCat);
    if (type) {
      const rawType = type.toLowerCase();
      setSelectedType(labelToSubtypeId[rawType] || rawType);
    }
    if (search) setSearchTerm(search);
    if (condition) setFilterCondition(condition as 'all' | 'new' | 'used');
    setIsHashInitialized(true);
  }, [hashKey]); // ✅ bonne dépendance
  
  
  useEffect(() => {
    if (!isHashInitialized) return;
    const params = new URLSearchParams();
    if (selectedJobCategory) params.set('categorie', selectedJobCategory);
    if (selectedMachineCategory) params.set('machine', selectedMachineCategory);
    if (selectedType) params.set('type', selectedType);
    if (searchTerm) params.set('search', searchTerm);
    if (filterCondition !== 'all') params.set('etat', filterCondition);
    window.location.hash = `#machines?${params.toString()}`;
  }, [selectedJobCategory, selectedMachineCategory, selectedType, searchTerm, filterCondition, isHashInitialized]);

  useEffect(() => {
    let cancelled = false;

    const fetchMachines = async () => {
      const firstBatch = Math.min(
        MACHINES_CATALOG_INITIAL_LIMIT,
        MACHINES_CATALOG_MEMORY_CAP
      );

      // 1er essai : colonnes explicites (rapide, léger).
      let { data, error } = await supabase
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .range(0, firstBatch - 1);

      // Fallback de sécurité : si une colonne de la liste n'existe pas en prod
      // (PostgREST renvoie une erreur 400), on retente avec select('*').
      if (error) {
        console.warn('[Machines] SELECT explicite a échoué, fallback select(*) :', error);
        const fb = await supabase
          .from('machines')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, firstBatch - 1);
        data = fb.data;
        error = fb.error;
      }

      if (cancelled) return;

      if (!error && data) {
        const mapped = data.map((m) => mapSupabaseRowToMachine(m as MachineRow));
        setMachines(mapped as Machine[]);
        setCatalogOffset(data.length);
        setHasMoreCatalog(
          data.length === firstBatch && data.length < MACHINES_CATALOG_MEMORY_CAP
        );
        if (data.length === 0) {
          console.info('[Machines] Aucun résultat — table vide OU RLS bloque le SELECT anonyme.');
        }
      } else {
        console.error('[Machines] Erreur chargement machines :', error);
        setMachines([]);
        setHasMoreCatalog(false);
      }
      setLoading(false);
    };

    void fetchMachines();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMoreCatalog = async () => {
    if (!hasMoreCatalog || loadingMore || loading) return;
    const remaining = MACHINES_CATALOG_MEMORY_CAP - catalogOffset;
    if (remaining <= 0) {
      setHasMoreCatalog(false);
      return;
    }
    setLoadingMore(true);
    try {
      const take = Math.min(MACHINES_CATALOG_STEP, remaining);
      const end = catalogOffset + take - 1;
      const { data, error } = await supabase
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .range(catalogOffset, end);

      if (!error && data?.length) {
        const mapped = data.map((m) => mapSupabaseRowToMachine(m as MachineRow));
        setMachines((prev) => [...prev, ...mapped]);
        const next = catalogOffset + data.length;
        setCatalogOffset(next);
        setHasMoreCatalog(
          data.length === take && next < MACHINES_CATALOG_MEMORY_CAP
        );
      } else if (error) {
        console.error('Erreur chargement machines (suite) :', error);
      } else {
        setHasMoreCatalog(false);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const deferredSearch = useDeferredValue(searchTerm);

  /**
   * Marques dynamiques : agrégées depuis les annonces chargées,
   * dédupliquées (case-insensitive), triées alphabétiquement.
   * Évite la liste hardcodée qui masquait toutes les autres marques.
   */
  const availableBrands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of machines) {
      const raw = (m.brand || '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [machines]);

  const filteredMachines = useMemo(() => {
    return machines.filter((machine) => {
      const matchBrand = selectedBrand
        ? machine.brand?.toLowerCase() === selectedBrand.toLowerCase()
        : true;

      // Filtrage secteur métier : tolérant (match sur __jobSector OU category brute).
      const matchCategory =
        selectedJobCategory && selectedJobCategory !== 'Tous secteurs'
          ? ((machine as MachineWithCatalogMeta).__jobSector || '').includes(selectedJobCategory.toLowerCase()) ||
            (machine.category || '').toLowerCase().includes(selectedJobCategory.toLowerCase())
          : true;

      // Filtrage groupe machine : tolérant (match sur __machineGroup OU type/category).
      const matchMachineCategory = selectedMachineCategory
        ? ((machine as MachineWithCatalogMeta).__machineGroup || '').includes(selectedMachineCategory.toLowerCase()) ||
          (machine.type || '').toLowerCase().includes(selectedMachineCategory.toLowerCase()) ||
          (machine.category || '').toLowerCase().includes(selectedMachineCategory.toLowerCase())
        : true;

      // Filtrage sous-type : tolérant — id exact OU label OU name/description.
      const matchType = selectedType
        ? String((machine as MachineWithCatalogMeta).__subcategoryId || '').toLowerCase() === selectedType.toLowerCase() ||
          String(machine.type || '').toLowerCase().includes(selectedType.toLowerCase()) ||
          String(machine.category || '').toLowerCase().includes(selectedType.toLowerCase()) ||
          String(machine.name || '').toLowerCase().includes(selectedType.toLowerCase())
        : true;

      const matchCondition =
        filterCondition === 'all' ? true : machine.condition === filterCondition;

      const matchSearch = deferredSearch
        ? machine.name?.toLowerCase().includes(deferredSearch.toLowerCase())
        : true;

      const matchPrice =
        (!priceMin || machine.price >= parseFloat(priceMin)) &&
        (!priceMax || machine.price <= parseFloat(priceMax));

      const machineYear = Number(
        (machine as MachineWithCatalogMeta).year ??
          (machine as MachineWithCatalogMeta).specifications?.year ??
          0
      );
      const matchYear =
        (!yearMin || (machineYear && machineYear >= parseInt(yearMin, 10))) &&
        (!yearMax || (machineYear && machineYear <= parseInt(yearMax, 10)));

      const noFilters =
        !selectedJobCategory &&
        !selectedMachineCategory &&
        !selectedType &&
        !selectedBrand &&
        !searchTerm &&
        !yearMin &&
        !yearMax &&
        !priceMin &&
        !priceMax &&
        filterCondition === 'all';

      return (
        noFilters ||
        (matchCategory &&
          matchMachineCategory &&
          matchType &&
          matchCondition &&
          matchSearch &&
          matchPrice &&
          matchYear &&
          matchBrand)
      );
    });
  }, [
    machines,
    selectedBrand,
    selectedJobCategory,
    selectedMachineCategory,
    selectedType,
    filterCondition,
    deferredSearch,
    searchTerm,
    priceMin,
    priceMax,
    yearMin,
    yearMax,
  ]);

  const sortedMachines = useMemo(() => {
    return [...filteredMachines].sort((a, b) => {
      if (sortBy === 'price') return (a.price || 0) - (b.price || 0);
      if (sortBy === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      const ta = new Date((a as MachineWithCatalogMeta).created_at || 0).getTime();
      const tb = new Date((b as MachineWithCatalogMeta).created_at || 0).getTime();
      return tb - ta;
    });
  }, [filteredMachines, sortBy]);

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
                <h1 className="text-2xl font-bold text-gray-900">Toutes les machines</h1>

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
                        : 'Aucun résultat pour ces filtres. Élargissez votre recherche ou retirez un critère.'}
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
