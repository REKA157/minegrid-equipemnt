import { describe, it, expect } from 'vitest';
import { buildMecanicienCockpit, type MecanicienCockpitInput } from './buildMecanicienCockpit';

// Helpers minimaux : casts `as` autorisés pour la brièveté des fixtures.
function preventive(opts: {
  overdue?: number;
  thisWeek?: number;
  interventions?: Array<{ technicianName: string; isThisWeek: boolean }>;
}): MecanicienCockpitInput['interventions'] {
  return {
    interventions: (opts.interventions ?? []) as MecanicienCockpitInput['interventions']['interventions'],
    stats: {
      total: 0,
      today: 0,
      thisWeek: opts.thisWeek ?? 0,
      overdue: opts.overdue ?? 0,
      byPriority: { haute: 0, moyenne: 0, basse: 0 },
      byStatus: { 'En attente': 0, 'En cours': 0, 'Terminé': 0, 'Annulé': 0 },
    },
  } as MecanicienCockpitInput['interventions'];
}

function emptyInput(): MecanicienCockpitInput {
  return {
    interventions: preventive({}),
    urgent: [] as MecanicienCockpitInput['urgent'],
    repairs: [] as MecanicienCockpitInput['repairs'],
    inventory: [] as MecanicienCockpitInput['inventory'],
    technicians: [] as MecanicienCockpitInput['technicians'],
  };
}

function findById<T extends { id: string }>(arr: T[], id: string): T | undefined {
  return arr.find((c) => c.id === id);
}

describe('buildMecanicienCockpit', () => {
  it('état vide honnête : aucune carte, headline à 0', () => {
    const out = buildMecanicienCockpit(emptyInput());
    expect(out.priorities).toHaveLength(0);
    expect(out.risks).toHaveLength(0);
    expect(out.opportunities).toHaveLength(0);
    expect(out.revenueValue).toBe(0);
    expect(out.revenueUnit).toBe('interventions');
    expect(out.revenueAvailable).toBe(true);
  });

  it('headline = overdue + urgentes, et cartes prio overdue/urgent présentes', () => {
    const input = emptyInput();
    input.interventions = preventive({ overdue: 3 });
    input.urgent = [{ id: 'u1' }, { id: 'u2' }] as MecanicienCockpitInput['urgent'];
    const out = buildMecanicienCockpit(input);
    expect(out.revenueValue).toBe(5);
    expect(findById(out.priorities, 'prio-overdue-interventions')?.label).toContain('3 interventions en retard');
    expect(findById(out.priorities, 'prio-urgent-interventions')?.label).toContain('2 interventions priorité Urgente');
  });

  it('réparations en cours -> carte prio-repairs-blocked avec le compte réel', () => {
    const input = emptyInput();
    input.repairs = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] as MecanicienCockpitInput['repairs'];
    const out = buildMecanicienCockpit(input);
    const card = findById(out.priorities, 'prio-repairs-blocked');
    expect(card?.label).toContain('3 réparations en cours');
    expect(card?.href).toBe('#dashboard-entreprise');
  });

  it('stock : rupture -> risk-stock-rupture ; >=2 -> opp-restock-batch ; 1 seul -> pas de batch', () => {
    const oneShort = emptyInput();
    oneShort.inventory = [
      { needs_restock: true },
      { needs_restock: false },
    ] as MecanicienCockpitInput['inventory'];
    const out1 = buildMecanicienCockpit(oneShort);
    expect(findById(out1.risks, 'risk-stock-rupture')?.label).toContain('1 pièces');
    expect(findById(out1.opportunities, 'opp-restock-batch')).toBeUndefined();

    const twoShort = emptyInput();
    twoShort.inventory = [
      { needs_restock: true },
      { needs_restock: true },
    ] as MecanicienCockpitInput['inventory'];
    const out2 = buildMecanicienCockpit(twoShort);
    expect(findById(out2.risks, 'risk-stock-rupture')?.label).toContain('2 pièces');
    expect(findById(out2.opportunities, 'opp-restock-batch')).toBeDefined();
  });

  it('techniciens : surcharge >=90 -> risk-technician-overload ; <60 & disponible -> opp-available-technicians', () => {
    const input = emptyInput();
    input.technicians = [
      { workload_percentage: 95, status: 'occupé' },
      { workload_percentage: 40, status: 'disponible' },
      { workload_percentage: 40, status: 'occupé' },
    ] as MecanicienCockpitInput['technicians'];
    const out = buildMecanicienCockpit(input);
    expect(findById(out.risks, 'risk-technician-overload')?.label).toContain('1 technicien(s) en surcharge');
    expect(findById(out.opportunities, 'opp-available-technicians')?.label).toContain('1 technicien(s) disponibles');
  });

  it('interventions de la semaine non assignées + préventives planifiées', () => {
    const input = emptyInput();
    input.interventions = preventive({
      thisWeek: 4,
      interventions: [
        { technicianName: 'Non assigné', isThisWeek: true },
        { technicianName: 'Karim', isThisWeek: true },
        { technicianName: 'Non assigné', isThisWeek: false },
      ],
    });
    const out = buildMecanicienCockpit(input);
    expect(findById(out.risks, 'risk-unassigned-interventions')?.label).toContain('1 interventions à venir sans technicien');
    expect(findById(out.opportunities, 'opp-preventive-this-week')?.label).toContain('4 maintenances préventives');
  });
});
