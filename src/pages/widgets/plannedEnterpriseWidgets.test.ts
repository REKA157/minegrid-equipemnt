import { describe, it, expect } from 'vitest';
import {
  PLANNED_ENTERPRISE_WIDGETS,
  PLANNED_ENTERPRISE_WIDGET_IDS,
} from './plannedEnterpriseWidgets';
import { MecanicienWidgets } from './MecanicienWidgets';
import { TransporteurWidgets } from './TransporteurWidgets';
import { CourtierWidgets } from './CourtierWidgets';

type AnySource = { widgets: Array<{ id: string }> };

const SOURCES: Record<string, AnySource> = {
  mecanicien: MecanicienWidgets as AnySource,
  transporteur: TransporteurWidgets as AnySource,
  courtier: CourtierWidgets as AnySource,
};

describe('registry planned enterprise widgets', () => {
  it('chaque widget planifié reste DÉFINI dans sa config métier (valeur conservée, pas supprimée)', () => {
    for (const w of PLANNED_ENTERPRISE_WIDGETS) {
      const source = SOURCES[w.role];
      expect(source, `source manquante pour le rôle ${w.role}`).toBeTruthy();
      const found = source.widgets.find((x) => x.id === w.id);
      expect(found, `widget planifié ${w.id} introuvable dans ${w.configModule} — ne pas le supprimer`).toBeTruthy();
    }
  });

  it('chaque entrée fournit une fiche TODO exploitable (titre cible, tables, provider, valeur)', () => {
    for (const w of PLANNED_ENTERPRISE_WIDGETS) {
      expect(w.status).toBe('planned');
      expect(w.targetTitle.trim().length).toBeGreaterThan(0);
      expect(w.targetTables.length).toBeGreaterThan(0);
      expect(w.targetProvider.trim().length).toBeGreaterThan(0);
      expect(w.businessValue.trim().length).toBeGreaterThan(0);
    }
  });

  it('les ids planifiés sont uniques', () => {
    const set = new Set(PLANNED_ENTERPRISE_WIDGET_IDS);
    expect(set.size).toBe(PLANNED_ENTERPRISE_WIDGET_IDS.length);
  });
});
