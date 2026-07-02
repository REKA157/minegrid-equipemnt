import type { MonitorProject, ProjectFilters } from '../types/monitor';

const ENRICHED_MIN_PROJECTS = 20;

export const TARGET_COUNTRIES: string[] = [
  'France', 'Germany', 'Spain', 'Italy', 'United Kingdom', 'Portugal',
  'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Greece', 'Poland', 'Romania',
  'Morocco', 'Algeria', 'Tunisia', 'Libya', 'Mauritania', 'Egypt',
  'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Oman', 'Bahrain',
  'Jordan', 'Lebanon', 'Iraq',
  'Senegal', "Côte d'Ivoire", 'Cameroon', 'Nigeria',
  'Ghana', 'Burkina Faso', 'Guinea', 'Niger', 'Mali', 'Benin', 'Togo',
];

export const COUNTRY_SEED_PROJECTS: MonitorProject[] = [
  { id: 'seed-fr', title: 'Modernisation réseau ferroviaire Lyon-Marseille', type: 'rail', phase: 'construction', country: 'France', region: 'Auvergne-Rhône-Alpes', lat: null, lon: null, budget_usd: 480_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-fr', confidence: 0.46, updated_at: '2026-03-24' },
  { id: 'seed-de', title: 'Corridor logistique Hambourg Nord', type: 'btp', phase: 'tender', country: 'Germany', region: 'Hamburg', lat: null, lon: null, budget_usd: 390_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-de', confidence: 0.44, updated_at: '2026-03-24' },
  { id: 'seed-es', title: 'Parc solaire Andalousie Est', type: 'energy', phase: 'construction', country: 'Spain', region: 'Andalusia', lat: null, lon: null, budget_usd: 300_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-es', confidence: 0.44, updated_at: '2026-03-24' },
  { id: 'seed-it', title: 'Extension portuaire Trieste', type: 'port', phase: 'financing', country: 'Italy', region: 'Friuli-Venezia Giulia', lat: null, lon: null, budget_usd: 340_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-it', confidence: 0.43, updated_at: '2026-03-24' },
  { id: 'seed-gb', title: 'Upgrade grid Midlands', type: 'energy', phase: 'tender', country: 'United Kingdom', region: 'England', lat: null, lon: null, budget_usd: 410_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-gb', confidence: 0.43, updated_at: '2026-03-24' },
  { id: 'seed-pt', title: 'Programme BTP Lisbonne métropole', type: 'btp', phase: 'construction', country: 'Portugal', region: 'Lisbon', lat: null, lon: null, budget_usd: 190_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-pt', confidence: 0.41, updated_at: '2026-03-24' },
  { id: 'seed-nl', title: 'Renforcement digues Rotterdam', type: 'infrastructure', phase: 'study', country: 'Netherlands', region: 'South Holland', lat: null, lon: null, budget_usd: 260_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-nl', confidence: 0.41, updated_at: '2026-03-24' },
  { id: 'seed-be', title: 'Interconnexion énergie Wallonie', type: 'energy', phase: 'financing', country: 'Belgium', region: 'Wallonia', lat: null, lon: null, budget_usd: 150_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-be', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-ch', title: 'Tunnel alpin logistique', type: 'road', phase: 'construction', country: 'Switzerland', region: 'Ticino', lat: null, lon: null, budget_usd: 620_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ch', confidence: 0.42, updated_at: '2026-03-24' },
  { id: 'seed-at', title: 'Hub ferroviaire Vienne', type: 'rail', phase: 'tender', country: 'Austria', region: 'Vienna', lat: null, lon: null, budget_usd: 210_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-at', confidence: 0.39, updated_at: '2026-03-24' },
  { id: 'seed-gr', title: 'Réseau électrique Attique', type: 'energy', phase: 'construction', country: 'Greece', region: 'Attica', lat: null, lon: null, budget_usd: 230_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-gr', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-pl', title: 'Corridor autoroutier Varsovie Est', type: 'road', phase: 'construction', country: 'Poland', region: 'Masovian', lat: null, lon: null, budget_usd: 360_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-pl', confidence: 0.41, updated_at: '2026-03-24' },
  { id: 'seed-ro', title: 'Modernisation réseau urbain Bucarest', type: 'btp', phase: 'tender', country: 'Romania', region: 'Bucharest', lat: null, lon: null, budget_usd: 170_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ro', confidence: 0.39, updated_at: '2026-03-24' },
  { id: 'seed-ma', title: 'Parc solaire Ouarzazate Extension', type: 'energy', phase: 'construction', country: 'Morocco', region: 'Drâa-Tafilalet', lat: null, lon: null, budget_usd: 210_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ma', confidence: 0.45, updated_at: '2026-03-24' },
  { id: 'seed-dz', title: 'Centrale hybride Alger Est', type: 'energy', phase: 'study', country: 'Algeria', region: 'Alger', lat: null, lon: null, budget_usd: 240_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-dz', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-tn', title: 'Réhabilitation routes régionales Tunis', type: 'road', phase: 'tender', country: 'Tunisia', region: 'Tunis', lat: null, lon: null, budget_usd: 120_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-tn', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-ly', title: 'Centrale gaz Tripoli Ouest', type: 'energy', phase: 'financing', country: 'Libya', region: 'Tripoli', lat: null, lon: null, budget_usd: 180_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ly', confidence: 0.35, updated_at: '2026-03-24' },
  { id: 'seed-mr', title: 'Ferme eolienne Nouadhibou', type: 'energy', phase: 'tender', country: 'Mauritania', region: 'Dakhlet Nouadhibou', lat: null, lon: null, budget_usd: 95_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-mr', confidence: 0.38, updated_at: '2026-03-24' },
  { id: 'seed-eg', title: 'Solar PV Benban Phase 3', type: 'energy', phase: 'construction', country: 'Egypt', region: 'Aswan', lat: null, lon: null, budget_usd: 260_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-eg', confidence: 0.44, updated_at: '2026-03-24' },
  { id: 'seed-sa', title: 'Réseau solaire Riyad Nord', type: 'energy', phase: 'construction', country: 'Saudi Arabia', region: 'Riyadh', lat: null, lon: null, budget_usd: 520_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-sa', confidence: 0.44, updated_at: '2026-03-24' },
  { id: 'seed-ae', title: 'Extension logistique Jebel Ali', type: 'btp', phase: 'tender', country: 'United Arab Emirates', region: 'Dubai', lat: null, lon: null, budget_usd: 340_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ae', confidence: 0.42, updated_at: '2026-03-24' },
  { id: 'seed-qa', title: 'Sous-station Doha Ouest', type: 'energy', phase: 'financing', country: 'Qatar', region: 'Doha', lat: null, lon: null, budget_usd: 180_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-qa', confidence: 0.41, updated_at: '2026-03-24' },
  { id: 'seed-kw', title: 'Réhabilitation axes Koweït City', type: 'road', phase: 'study', country: 'Kuwait', region: 'Al Asimah', lat: null, lon: null, budget_usd: 145_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-kw', confidence: 0.39, updated_at: '2026-03-24' },
  { id: 'seed-om', title: 'Parc eolien Dhofar II', type: 'energy', phase: 'tender', country: 'Oman', region: 'Dhofar', lat: null, lon: null, budget_usd: 165_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-om', confidence: 0.39, updated_at: '2026-03-24' },
  { id: 'seed-bh', title: 'Programme BTP Manama Grand Centre', type: 'btp', phase: 'construction', country: 'Bahrain', region: 'Manama', lat: null, lon: null, budget_usd: 120_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-bh', confidence: 0.38, updated_at: '2026-03-24' },
  { id: 'seed-jo', title: 'Projet eau-énergie Amman', type: 'energy', phase: 'financing', country: 'Jordan', region: 'Amman', lat: null, lon: null, budget_usd: 205_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-jo', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-lb', title: 'Réseau transport Beyrouth périphérie', type: 'road', phase: 'tender', country: 'Lebanon', region: 'Beirut', lat: null, lon: null, budget_usd: 95_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-lb', confidence: 0.37, updated_at: '2026-03-24' },
  { id: 'seed-iq', title: 'Corridor logistique Bassora', type: 'btp', phase: 'construction', country: 'Iraq', region: 'Basra', lat: null, lon: null, budget_usd: 260_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-iq', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-sn', title: 'Programme logements sociaux Dakar', type: 'btp', phase: 'construction', country: 'Senegal', region: 'Dakar', lat: null, lon: null, budget_usd: 160_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-sn', confidence: 0.45, updated_at: '2026-03-24' },
  { id: 'seed-ci', title: 'Réseau routier Abidjan périphérie', type: 'road', phase: 'construction', country: "Côte d'Ivoire", region: 'Abidjan', lat: null, lon: null, budget_usd: 230_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ci', confidence: 0.44, updated_at: '2026-03-24' },
  { id: 'seed-cm', title: 'Programme ponts et chaussées Douala', type: 'btp', phase: 'tender', country: 'Cameroon', region: 'Littoral', lat: null, lon: null, budget_usd: 130_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-cm', confidence: 0.4, updated_at: '2026-03-24' },
  { id: 'seed-ng', title: 'Modernisation corridors Lagos', type: 'road', phase: 'construction', country: 'Nigeria', region: 'Lagos', lat: null, lon: null, budget_usd: 420_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ng', confidence: 0.46, updated_at: '2026-03-24' },
  { id: 'seed-gh', title: 'Projet BTP métropolitain Accra', type: 'btp', phase: 'study', country: 'Ghana', region: 'Greater Accra', lat: null, lon: null, budget_usd: 110_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-gh', confidence: 0.36, updated_at: '2026-03-24' },
  { id: 'seed-bf', title: 'Réhabilitation axes Ouagadougou', type: 'road', phase: 'tender', country: 'Burkina Faso', region: 'Centre', lat: null, lon: null, budget_usd: 90_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-bf', confidence: 0.35, updated_at: '2026-03-24' },
  { id: 'seed-gn', title: 'Travaux publics Conakry', type: 'btp', phase: 'financing', country: 'Guinea', region: 'Conakry', lat: null, lon: null, budget_usd: 105_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-gn', confidence: 0.35, updated_at: '2026-03-24' },
  { id: 'seed-ne', title: 'Programme voirie Niamey', type: 'road', phase: 'study', country: 'Niger', region: 'Niamey', lat: null, lon: null, budget_usd: 75_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ne', confidence: 0.33, updated_at: '2026-03-24' },
  { id: 'seed-ml', title: 'Infrastructures urbaines Bamako', type: 'btp', phase: 'tender', country: 'Mali', region: 'Bamako', lat: null, lon: null, budget_usd: 98_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-ml', confidence: 0.33, updated_at: '2026-03-24' },
  { id: 'seed-bj', title: 'Aménagement routier Cotonou', type: 'road', phase: 'construction', country: 'Benin', region: 'Littoral', lat: null, lon: null, budget_usd: 88_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-bj', confidence: 0.38, updated_at: '2026-03-24' },
  { id: 'seed-tg', title: 'Projet BTP Grand Lomé', type: 'btp', phase: 'study', country: 'Togo', region: 'Maritime', lat: null, lon: null, budget_usd: 70_000_000, start_date: null, end_date: null, source: 'Dataset (enrichi)', source_url: null, fingerprint: 'seed-tg', confidence: 0.33, updated_at: '2026-03-24' },
];

const COUNTRY_BUDGET_RANGES_USD: Record<string, { min: number; max: number }> = {
  France: { min: 100_000, max: 40_000_000_000 },
  Germany: { min: 100_000, max: 45_000_000_000 },
  Spain: { min: 80_000, max: 30_000_000_000 },
  Italy: { min: 80_000, max: 35_000_000_000 },
  'United Kingdom': { min: 100_000, max: 45_000_000_000 },
  Portugal: { min: 70_000, max: 18_000_000_000 },
  Netherlands: { min: 80_000, max: 25_000_000_000 },
  Belgium: { min: 80_000, max: 20_000_000_000 },
  Switzerland: { min: 100_000, max: 30_000_000_000 },
  Austria: { min: 80_000, max: 20_000_000_000 },
  Greece: { min: 70_000, max: 18_000_000_000 },
  Poland: { min: 70_000, max: 24_000_000_000 },
  Romania: { min: 60_000, max: 16_000_000_000 },
  Morocco: { min: 100_000, max: 8_000_000_000 },
  Senegal: { min: 80_000, max: 4_000_000_000 },
  "Côte d'Ivoire": { min: 80_000, max: 6_000_000_000 },
  Cameroon: { min: 80_000, max: 4_500_000_000 },
  Nigeria: { min: 100_000, max: 20_000_000_000 },
  'Saudi Arabia': { min: 100_000, max: 30_000_000_000 },
  'United Arab Emirates': { min: 100_000, max: 25_000_000_000 },
  Qatar: { min: 80_000, max: 15_000_000_000 },
  Kuwait: { min: 80_000, max: 12_000_000_000 },
  Oman: { min: 80_000, max: 12_000_000_000 },
  Bahrain: { min: 60_000, max: 6_000_000_000 },
  Jordan: { min: 60_000, max: 8_000_000_000 },
  Lebanon: { min: 60_000, max: 8_000_000_000 },
  Iraq: { min: 80_000, max: 20_000_000_000 },
  // Valeurs par défaut pour pays non mappés explicitement
  __default__: { min: 50_000, max: 12_000_000_000 },
};

function isBudgetPlausible(country: string | null, budget: number | null): boolean {
  if (budget == null) return true;
  if (!Number.isFinite(budget) || budget <= 0) return false;
  const range = COUNTRY_BUDGET_RANGES_USD[country || ''] || COUNTRY_BUDGET_RANGES_USD.__default__;
  return budget >= range.min && budget <= range.max;
}

export function normalizeBudget(project: MonitorProject): MonitorProject {
  // Le montant signé World Bank est autoritaire (vrai prix du contrat) -> on lui fait
  // confiance sans le passer par la fourchette de plausibilité (conçue pour le bruit scrapé).
  if ((project.source || '').includes('World Bank')) return project;
  if (isBudgetPlausible(project.country, project.budget_usd)) return project;
  return { ...project, budget_usd: null };
}

export function ensureCountryCoverage(items: MonitorProject[], filters: ProjectFilters): MonitorProject[] {
  const byFingerprint = new Set(items.map((p) => p.fingerprint));
  const scope = filters.country ? [filters.country] : TARGET_COUNTRIES;
  const present = new Set(items.map((p) => p.country).filter(Boolean) as string[]);
  const missingCountries = scope.filter((country) => !present.has(country));
  if (missingCountries.length === 0) return items;

  const seedPool = filters.type ? COUNTRY_SEED_PROJECTS.filter((p) => p.type === filters.type) : COUNTRY_SEED_PROJECTS;
  const additions = seedPool
    .filter((p) => missingCountries.includes(p.country || ''))
    .filter((p) => !byFingerprint.has(p.fingerprint))
    .map((p) => ({ ...p, id: `seed-${p.fingerprint}` }));

  return [...items, ...additions];
}

function isInfraType(type: string | null): boolean {
  return type === 'road' || type === 'port' || type === 'rail' || type === 'dam' || type === 'industrial_zone' || type === 'btp';
}

export function ensureLayerCoverageByCountry(items: MonitorProject[], filters: ProjectFilters): MonitorProject[] {
  // On applique la couverture multi-couches surtout en vue globale (sans filtre type/phase strict).
  if (filters.type || filters.phase) return items;

  const scope = filters.country ? [filters.country] : TARGET_COUNTRIES;
  const existing = new Set(items.map((p) => p.fingerprint));
  const additions: MonitorProject[] = [];

  for (const country of scope) {
    const countryItems = items.filter((p) => p.country === country);
    const hasMine = countryItems.some((p) => p.type === 'mine');
    const hasEnergy = countryItems.some((p) => p.type === 'energy');
    const hasInfra = countryItems.some((p) => isInfraType(p.type));
    const hasTender = countryItems.some((p) => p.phase === 'tender');

    const candidates: MonitorProject[] = [];
    if (!hasMine) {
      candidates.push({
        id: `layer-seed-${country}-mine`,
        title: `Projet minier prioritaire - ${country}`,
        type: 'mine',
        phase: 'study',
        country,
        region: null,
        lat: null,
        lon: null,
        budget_usd: 120_000_000,
        start_date: null,
        end_date: null,
        source: 'Dataset (enrichi)',
        source_url: null,
        fingerprint: `layer-seed-${country}-mine`,
        confidence: 0.35,
        updated_at: '2026-03-24',
      });
    }
    if (!hasEnergy) {
      candidates.push({
        id: `layer-seed-${country}-energy`,
        title: `Projet energie prioritaire - ${country}`,
        type: 'energy',
        phase: 'financing',
        country,
        region: null,
        lat: null,
        lon: null,
        budget_usd: 140_000_000,
        start_date: null,
        end_date: null,
        source: 'Dataset (enrichi)',
        source_url: null,
        fingerprint: `layer-seed-${country}-energy`,
        confidence: 0.35,
        updated_at: '2026-03-24',
      });
    }
    if (!hasInfra) {
      candidates.push({
        id: `layer-seed-${country}-infra`,
        title: `Projet infrastructure prioritaire - ${country}`,
        type: 'road',
        phase: 'construction',
        country,
        region: null,
        lat: null,
        lon: null,
        budget_usd: 110_000_000,
        start_date: null,
        end_date: null,
        source: 'Dataset (enrichi)',
        source_url: null,
        fingerprint: `layer-seed-${country}-infra`,
        confidence: 0.35,
        updated_at: '2026-03-24',
      });
    }
    if (!hasTender) {
      candidates.push({
        id: `layer-seed-${country}-tender`,
        title: `Appel d offres prioritaire - ${country}`,
        type: 'btp',
        phase: 'tender',
        country,
        region: null,
        lat: null,
        lon: null,
        budget_usd: 90_000_000,
        start_date: null,
        end_date: null,
        source: 'Dataset (enrichi)',
        source_url: null,
        fingerprint: `layer-seed-${country}-tender`,
        confidence: 0.33,
        updated_at: '2026-03-24',
      });
    }

    for (const c of candidates) {
      if (!existing.has(c.fingerprint)) {
        existing.add(c.fingerprint);
        additions.push(c);
      }
    }
  }

  return additions.length ? [...items, ...additions] : items;
}

function matchesFilters(project: MonitorProject, filters: ProjectFilters): boolean {
  if (filters.country && project.country !== filters.country) return false;
  if (filters.type && project.type !== filters.type) return false;
  if (filters.phase && project.phase !== filters.phase) return false;

  if (filters.source_kind) {
    const s = (project.source || '').toLowerCase();
    if (filters.source_kind === 'public' && !s.startsWith('public portal')) return false;
    if (filters.source_kind === 'mdb' && !s.startsWith('mdb -')) return false;
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const hay = `${project.title || ''} ${project.country || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

export function enrichForDisplay(
  liveItems: MonitorProject[],
  demoProjects: MonitorProject[],
  filters: ProjectFilters,
): MonitorProject[] {
  if (liveItems.length >= ENRICHED_MIN_PROJECTS) return liveItems;

  const byFingerprint = new Set(liveItems.map((p) => p.fingerprint));
  const missing = ENRICHED_MIN_PROJECTS - liveItems.length;

  const extra = demoProjects
    .filter((p) => matchesFilters(p, filters))
    .filter((p) => !byFingerprint.has(p.fingerprint))
    .slice(0, Math.max(0, missing))
    .map((p) => ({
      ...p,
      id: `enriched-${p.id}`,
      source: `${p.source || 'Dataset'} (enrichi)`,
    }));

  return [...liveItems, ...extra].map(normalizeBudget);
}

