import { describe, it, expect } from 'vitest';
import {
  buildTransporteurCockpit,
  type TransporteurCockpitInput,
} from './buildTransporteurCockpit';

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();
const DAY = 86_400_000;

function emptyInput(): TransporteurCockpitInput {
  return {
    deliveries: {
      total: 0,
      inProgress: 0,
      planned: 0,
      delayed: 0,
      urgent: 0,
      rows: [],
    },
    drivers: [],
    vehicles: [],
    schedule: [],
    costs: [],
  } as unknown as TransporteurCockpitInput;
}

function ids(signals: { id: string }[]): string[] {
  return signals.map((s) => s.id);
}

describe('buildTransporteurCockpit', () => {
  it('headline: livraisons actives (total) avec unité, état vide honnête sans cartes', () => {
    const out = buildTransporteurCockpit(emptyInput(), NOW);
    expect(out.revenueLabel).toBe('Livraisons actives');
    expect(out.revenueValue).toBe(0);
    expect(out.revenueUnit).toBe('livraisons');
    expect(out.revenueAvailable).toBe(true);
    expect(out.revenueHint).toBe('Aucune livraison active');
    expect(out.priorities).toHaveLength(0);
    expect(out.risks).toHaveLength(0);
    expect(out.opportunities).toHaveLength(0);
  });

  it('priorité deliveries-delayed quand delayed > 0 et headline agrège le total', () => {
    const input = emptyInput();
    input.deliveries = {
      total: 3,
      inProgress: 1,
      planned: 1,
      delayed: 1,
      urgent: 0,
      rows: [],
    } as unknown as TransporteurCockpitInput['deliveries'];
    const out = buildTransporteurCockpit(input, NOW);
    expect(out.revenueValue).toBe(3);
    expect(ids(out.priorities)).toContain('deliveries-delayed');
    expect(out.revenueHint).toContain('1 en retard');
  });

  it('priorité deliveries-unassigned : planifiée sans driver ou sans vehicle', () => {
    const input = emptyInput();
    input.deliveries = {
      total: 2,
      inProgress: 0,
      planned: 2,
      delayed: 0,
      urgent: 0,
      rows: [
        { id: 'd1', status: 'Planifiée', driver_id: null, vehicle_id: 'v1' },
        { id: 'd2', status: 'Planifiée', driver_id: 'dr1', vehicle_id: 'v2' },
      ],
    } as unknown as TransporteurCockpitInput['deliveries'];
    const out = buildTransporteurCockpit(input, NOW);
    const card = out.priorities.find((p) => p.id === 'deliveries-unassigned');
    expect(card).toBeDefined();
    expect(card!.label).toContain('1 livraison');
  });

  it('priorité driver-schedule-today comptée sur les missions du jour uniquement', () => {
    const input = emptyInput();
    input.schedule = [
      {
        id: 'dr1',
        missions: [
          { id: 'm1', pickupDate: new Date(NOW).toISOString() },
          { id: 'm2', pickupDate: new Date(NOW + 3 * DAY).toISOString() },
        ],
      },
    ] as unknown as TransporteurCockpitInput['schedule'];
    const out = buildTransporteurCockpit(input, NOW);
    const card = out.priorities.find((p) => p.id === 'driver-schedule-today');
    expect(card).toBeDefined();
    expect(card!.label).toContain('1 mission');
  });

  it('risques : ETA dépassée + permis expirant + véhicule en maintenance', () => {
    const input = emptyInput();
    input.deliveries = {
      total: 1,
      inProgress: 1,
      planned: 0,
      delayed: 0,
      urgent: 0,
      rows: [
        {
          id: 'd1',
          status: 'En cours',
          expected_delivery_date: new Date(NOW - 2 * DAY).toISOString(),
          actual_delivery_date: null,
        },
      ],
    } as unknown as TransporteurCockpitInput['deliveries'];
    input.drivers = [
      { id: 'dr1', license_expiry: new Date(NOW + 10 * DAY).toISOString(), availability_status: 'En mission' },
    ] as unknown as TransporteurCockpitInput['drivers'];
    input.vehicles = [
      { id: 'v1', status: 'Maintenance' },
    ] as unknown as TransporteurCockpitInput['vehicles'];
    const out = buildTransporteurCockpit(input, NOW);
    expect(ids(out.risks)).toEqual(
      expect.arrayContaining(['delivery-eta-overdue', 'driver-license-expiry', 'vehicle-maintenance-due']),
    );
  });

  it('opportunités : tendance coûts (trips>0) + capacité libre (chauffeur ET véhicule)', () => {
    const input = emptyInput();
    input.costs = [
      { name: 'jan', label: 'jan', value: 0, cost: 0, trips: 0, km: 0 },
      { name: 'fév', label: 'fév', value: 1200, cost: 1200, trips: 2, km: 80 },
    ] as unknown as TransporteurCockpitInput['costs'];
    input.drivers = [
      { id: 'dr1', availability_status: 'Disponible', license_expiry: null },
    ] as unknown as TransporteurCockpitInput['drivers'];
    input.vehicles = [
      { id: 'v1', status: 'Disponible' },
    ] as unknown as TransporteurCockpitInput['vehicles'];
    const out = buildTransporteurCockpit(input, NOW);
    expect(ids(out.opportunities)).toEqual(
      expect.arrayContaining(['transport-cost-trend', 'fleet-idle-capacity']),
    );

    // fleet-idle-capacity n'apparaît pas si un seul des deux côtés est libre
    input.drivers = [
      { id: 'dr1', availability_status: 'En mission', license_expiry: null },
    ] as unknown as TransporteurCockpitInput['drivers'];
    const out2 = buildTransporteurCockpit(input, NOW);
    expect(ids(out2.opportunities)).not.toContain('fleet-idle-capacity');
  });
});
