/**
 * Ces sept fonctions vivaient au milieu de WidgetRenderer.tsx et n'avaient
 * AUCUN test : on ne pouvait pas les atteindre sans monter tout le tableau de
 * bord et simuler une dizaine d'API. Sorties du fichier, elles se testent
 * directement.
 *
 * Les cas couverts ne sont pas décoratifs : ce sont les entrées réelles que
 * l'API renvoie, y compris les vides et les malformées.
 */

import { describe, it, expect } from 'vitest';
import {
  getFontSizeFromWidgetSize,
  mapLoueurStatusForCalendar,
  mapUpcomingRentalsForWidget,
  mapRepairsForList,
  mapInventoryForChart,
  mapWorkloadForChart,
  mapEquipmentAvailabilityForWidget,
} from './widgetRendererMappers';

describe('getFontSizeFromWidgetSize', () => {
  it('donne une taille distincte par format de widget', () => {
    const tailles = ['1/3', '1/2', '2/3', '1/1'].map((t) => getFontSizeFromWidgetSize(t));
    expect(new Set(tailles).size).toBe(4);
  });

  it('distingue le titre de la valeur pour un même format', () => {
    expect(getFontSizeFromWidgetSize('1/1', 'title')).not.toBe(
      getFontSizeFromWidgetSize('1/1', 'value'),
    );
  });

  it('retombe sur une taille par défaut pour un format inconnu', () => {
    // Un widget mal configuré ne doit pas rendre du texte sans classe CSS.
    expect(getFontSizeFromWidgetSize('3/7')).toBe('text-base');
    expect(getFontSizeFromWidgetSize('', 'value')).toBe('text-base');
  });
});

describe('mapLoueurStatusForCalendar', () => {
  it('reconnaît « en cours » quelle que soit la casse', () => {
    expect(mapLoueurStatusForCalendar('En cours')).toBe('in_progress');
    expect(mapLoueurStatusForCalendar('EN COURS DE LOCATION')).toBe('in_progress');
  });

  it('reconnaît « confirmée » et « prête », accentuée ou non', () => {
    expect(mapLoueurStatusForCalendar('Confirmée')).toBe('confirmed');
    expect(mapLoueurStatusForCalendar('prete')).toBe('confirmed');
    expect(mapLoueurStatusForCalendar('prête')).toBe('confirmed');
  });

  it('classe en attente tout le reste, y compris le vide', () => {
    expect(mapLoueurStatusForCalendar('')).toBe('pending');
    expect(mapLoueurStatusForCalendar(undefined as unknown as string)).toBe('pending');
    expect(mapLoueurStatusForCalendar('Annulée')).toBe('pending');
  });

  it('donne « en cours » la priorité sur « confirmée » si les deux apparaissent', () => {
    // L'ordre des tests dans la fonction est un choix, pas un hasard : on le fige.
    expect(mapLoueurStatusForCalendar('Confirmée, en cours')).toBe('in_progress');
  });
});

describe('mapUpcomingRentalsForWidget', () => {
  const ligne = {
    id: 42,
    equipmentFullName: 'Caterpillar 320D',
    clientName: 'SOMAGEC',
    start_date: '2026-10-01T08:00:00Z',
    end_date: '2026-10-15T18:00:00Z',
    pricePerDay: '1500',
    status: 'Confirmée',
  };

  it('ne garde que la date, pas l heure', () => {
    const [r] = mapUpcomingRentalsForWidget([ligne] as never);
    expect(r.startDate).toBe('2026-10-01');
    expect(r.endDate).toBe('2026-10-15');
  });

  it('convertit le tarif en nombre, même transmis en texte', () => {
    const [r] = mapUpcomingRentalsForWidget([ligne] as never);
    expect(r.dailyRate).toBe(1500);
  });

  it('met 0 plutôt que NaN quand le tarif est illisible', () => {
    // Un NaN affiché à l'écran donne « NaN MAD » au client : jamais.
    const [r] = mapUpcomingRentalsForWidget([{ ...ligne, pricePerDay: 'gratuit' }] as never);
    expect(r.dailyRate).toBe(0);
  });

  it('ne casse pas sur une date absente', () => {
    const [r] = mapUpcomingRentalsForWidget([
      { ...ligne, start_date: null, end_date: undefined },
    ] as never);
    expect(r.startDate).toBe('');
    expect(r.endDate).toBe('');
  });

  it('rend un tableau vide pour une entrée vide', () => {
    expect(mapUpcomingRentalsForWidget([] as never)).toEqual([]);
  });
});

describe('mapRepairsForList', () => {
  it('classe en priorité haute une réparation urgente ou en cours', () => {
    const r = mapRepairsForList([
      { status: 'URGENT', equipment: 'Pelle', problem: 'Hydraulique' },
      { status: 'En cours', equipment: 'Pelle', problem: 'Hydraulique' },
    ] as never);
    expect(r.map((x) => x.priority)).toEqual(['high', 'high']);
  });

  it('classe en priorité moyenne une réparation en attente', () => {
    const [r] = mapRepairsForList([{ status: 'En attente' }] as never);
    expect(r.priority).toBe('medium');
  });

  it('classe en priorité basse tout le reste', () => {
    const [r] = mapRepairsForList([{ status: 'Terminée' }] as never);
    expect(r.priority).toBe('low');
  });

  it('fabrique un identifiant de repli quand la ligne n en a pas', () => {
    // Sans identifiant, React réutilise mal les lignes de la liste.
    const r = mapRepairsForList([{ status: 'x' }, { status: 'y' }] as never);
    expect(r[0].id).toBe('repair-0');
    expect(r[1].id).toBe('repair-1');
  });

  it('remplit les libellés manquants plutôt que d afficher « undefined »', () => {
    const [r] = mapRepairsForList([{}] as never);
    expect(r.title).toBe('Équipement — Réparation');
    expect(r.description).toContain('Non assigné');
    expect(r.description).not.toContain('undefined');
    expect(r.status).toBe('En attente');
  });

  it('formate le coût à la française quand il est numérique', () => {
    const [r] = mapRepairsForList([{ cost: 12500 }] as never);
    expect(r.description).toContain((12500).toLocaleString('fr-FR'));
  });
});

describe('mapInventoryForChart', () => {
  it('plafonne le graphique à 8 barres', () => {
    // Au-delà, les étiquettes se chevauchent et le graphique devient illisible.
    const rows = Array.from({ length: 20 }, (_, i) => ({ category: `C${i}`, stock: i }));
    expect(mapInventoryForChart(rows as never)).toHaveLength(8);
  });

  it('prend le titre à défaut de catégorie, puis un libellé générique', () => {
    const r = mapInventoryForChart([
      { category: 'Filtres', stock: 3, minStock: 1 },
      { title: 'Courroies', stock: 2, minStock: 1 },
      { stock: 1, minStock: 1 },
    ] as never);
    expect(r.map((x) => x.name)).toEqual(['Filtres', 'Courroies', 'Article']);
  });

  it('met 0 plutôt que NaN sur un stock illisible', () => {
    const [r] = mapInventoryForChart([{ category: 'X', stock: null, minStock: '—' }] as never);
    expect(r.value).toBe(0);
    expect(r.min).toBe(0);
  });
});

describe('mapWorkloadForChart', () => {
  it('arrondit la charge à l entier', () => {
    const r = mapWorkloadForChart([
      { name: 'Ali', workload_percentage: 72.4 },
      { name: 'Sara', workload_percentage: 72.6 },
    ] as never);
    expect(r.map((x) => x.value)).toEqual([72, 73]);
  });

  it('met 0 et un libellé générique sur une ligne incomplète', () => {
    const [r] = mapWorkloadForChart([{}] as never);
    expect(r).toEqual({ name: 'Technicien', value: 0 });
  });
});

describe('mapEquipmentAvailabilityForWidget', () => {
  it('traduit les trois statuts métier', () => {
    const r = mapEquipmentAvailabilityForWidget([
      { id: 1, status: 'Disponible' },
      { id: 2, status: 'En location' },
      { id: 3, status: 'En panne' },
    ]);
    expect(r.map((x) => x.status)).toEqual(['available', 'rented', 'maintenance']);
  });

  it('traite tout statut inconnu comme « maintenance »', () => {
    // Repli prudent : mieux vaut annoncer une machine indisponible à tort que
    // la promettre à un client alors qu'on ne sait pas où elle est.
    const [r] = mapEquipmentAvailabilityForWidget([{ id: 9, status: 'Inconnu' }]);
    expect(r.status).toBe('maintenance');
  });

  it('prend le nom complet, puis le nom, puis un libellé générique', () => {
    const r = mapEquipmentAvailabilityForWidget([
      { id: 1, equipmentFullName: 'CAT 320D', name: 'CAT' },
      { id: 2, name: 'Komatsu' },
      { id: 3 },
    ]);
    expect(r.map((x) => x.name)).toEqual(['CAT 320D', 'Komatsu', 'Équipement']);
  });

  it('extrait les dates de retour et de maintenance quand elles existent', () => {
    const [r] = mapEquipmentAvailabilityForWidget([
      {
        id: 1,
        currentRental: { endDate: '2026-11-03T12:00:00Z' },
        currentIntervention: { scheduledDate: '2026-12-01T09:00:00Z' },
      },
    ]);
    expect(r.returnDate).toBe('2026-11-03');
    expect(r.nextMaintenance).toBe('2026-12-01');
  });

  it('laisse ces dates indéfinies plutôt que d inventer une valeur', () => {
    const [r] = mapEquipmentAvailabilityForWidget([{ id: 1 }]);
    expect(r.returnDate).toBeUndefined();
    expect(r.nextMaintenance).toBeUndefined();
  });
});
