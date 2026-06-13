import { describe, it, expect } from 'vitest';
import { buildLogisticienCockpit, type LogisticienCockpitInput } from './buildLogisticienCockpit';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

const base: LogisticienCockpitInput = {
  warehouses: {
    warehouseCount: 0,
    weightedOccupancyPct: 0,
    criticalWarehouses: 0,
    maintenanceWarehouses: 0,
    totalCapacityPallets: 0,
    totalUsedPallets: 0,
  },
  routes: [],
  alerts: [],
  kpis: {
    chartData: [],
    latestOnTime: 0,
    latestFillRate: 0,
    latestLeadDays: 0,
    latestIncidents: 0,
    onTimeDelta: 0,
  },
  cases: [],
};

// Raccourcis de fabrication (casts `as` autorisés pour brièveté).
const route = (over: Record<string, unknown>) =>
  ({ id: 'r', route_ref: 'R', status: 'En cours', eta: null, ...over } as LogisticienCockpitInput['routes'][number]);
const alert = (over: Record<string, unknown>) =>
  ({ id: 'a', title: 'SKU', description: 'Normal — stock 5 / cible 10', status: 'Ouvert', priority: 'medium', ...over } as LogisticienCockpitInput['alerts'][number]);
const txCase = (status: string) =>
  ({ id: 'c', status, kind: 'sale', created_at: '', updated_at: '' } as unknown as LogisticienCockpitInput['cases'][number]);

describe('buildLogisticienCockpit', () => {
  it('headline = taux d\'occupation pondéré en %, avec entrepôts critiques', () => {
    const c = buildLogisticienCockpit(
      {
        ...base,
        warehouses: { ...base.warehouses, warehouseCount: 3, weightedOccupancyPct: 87.5, criticalWarehouses: 1 },
      },
      NOW,
    );
    expect(c.revenueValue).toBe(87.5);
    expect(c.revenueUnit).toBe('%');
    expect(c.revenueAvailable).toBe(true);
    expect(c.revenueHint).toContain('3 entrepôt');
    expect(c.revenueHint).toContain('1 critique');
  });

  it('états vides honnêtes : aucune carte sans donnée', () => {
    const c = buildLogisticienCockpit(base, NOW);
    expect(c.priorities).toHaveLength(0);
    expect(c.risks).toHaveLength(0);
    expect(c.opportunities).toHaveLength(0);
  });

  it('priorités : alertes stock (urgent), routes en retard, entrepôt à désaturer, dossiers logistiques', () => {
    const overdue = new Date(NOW - 86_400_000).toISOString();
    const c = buildLogisticienCockpit(
      {
        ...base,
        warehouses: { ...base.warehouses, criticalWarehouses: 2, maintenanceWarehouses: 1 },
        alerts: [alert({ priority: 'high' })],
        routes: [route({ status: 'Retard' }), route({ id: 'r2', eta: overdue })],
        cases: [txCase('logistics'), txCase('delivery')],
      },
      NOW,
    );
    const stock = c.priorities.find((p) => p.id === 'pri:stock-alerts');
    expect(stock?.tone).toBe('urgent');
    expect(c.priorities.find((p) => p.id === 'pri:routes-retard')?.label).toContain('2 route');
    expect(c.priorities.some((p) => p.id === 'pri:warehouse-desaturer')).toBe(true);
    expect(c.priorities.find((p) => p.id === 'pri:dossiers-logistique')?.label).toContain('2 dossier');
  });

  it('ne signale pas les routes planifiées/à l\'heure comme en retard, ni les dossiers hors phase logistique', () => {
    const future = new Date(NOW + 86_400_000).toISOString();
    const c = buildLogisticienCockpit(
      {
        ...base,
        routes: [route({ status: 'Planifié', eta: future })],
        cases: [txCase('negotiation'), txCase('closed')],
      },
      NOW,
    );
    expect(c.priorities.some((p) => p.id === 'pri:routes-retard')).toBe(false);
    expect(c.priorities.some((p) => p.id === 'pri:dossiers-logistique')).toBe(false);
  });

  it('risque : performance livraisons à temps en baisse OU incidents récents', () => {
    const delta = buildLogisticienCockpit({ ...base, kpis: { ...base.kpis, onTimeDelta: -4.2 } }, NOW);
    expect(delta.risks.some((r) => r.id === 'risk:scm-ontime')).toBe(true);

    const incidents = buildLogisticienCockpit({ ...base, kpis: { ...base.kpis, latestIncidents: 2 } }, NOW);
    expect(incidents.risks.find((r) => r.id === 'risk:scm-ontime')?.detail).toContain('2 incident');

    const ok = buildLogisticienCockpit({ ...base, kpis: { ...base.kpis, onTimeDelta: 3, latestIncidents: 0 } }, NOW);
    expect(ok.risks).toHaveLength(0);
  });

  it('opportunités : excédent à rapatrier, capacité dispo, routes planifiées à consolider', () => {
    const c = buildLogisticienCockpit(
      {
        ...base,
        warehouses: { ...base.warehouses, criticalWarehouses: 1, totalCapacityPallets: 100, totalUsedPallets: 60 },
        alerts: [
          alert({ id: 'a1', description: 'Excédent — stock 20 / cible 5' }),
          alert({ id: 'a2', description: 'Rupture — stock 0 / cible 8' }),
        ],
        routes: [route({ id: 'p1', status: 'Planifié' }), route({ id: 'p2', status: 'Planifié' })],
      },
      NOW,
    );
    expect(c.opportunities.some((o) => o.id === 'opp:excedent-rapatrier')).toBe(true);
    expect(c.opportunities.find((o) => o.id === 'opp:capacite-dispo')?.label).toContain('40 palette');
    expect(c.opportunities.find((o) => o.id === 'opp:routes-consolider')?.label).toContain('2 routes');
  });

  it('pas d\'excédent à rapatrier sans rupture/seuil bas en contrepartie', () => {
    const c = buildLogisticienCockpit(
      { ...base, alerts: [alert({ id: 'a1', description: 'Excédent — stock 20 / cible 5' })] },
      NOW,
    );
    expect(c.opportunities.some((o) => o.id === 'opp:excedent-rapatrier')).toBe(false);
  });
});
