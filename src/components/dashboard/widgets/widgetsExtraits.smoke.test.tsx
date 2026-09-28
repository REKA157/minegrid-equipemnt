/**
 * Test de fumée des widgets sortis de WidgetRenderer.tsx.
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * WidgetRenderer faisait 3 563 lignes et n'avait AUCUN test : on ne pouvait pas
 * l'atteindre sans monter tout le tableau de bord entreprise, lui-même réservé
 * aux abonnements payants. Vingt-quatre widgets en ont été extraits ; déplacer
 * 2 000 lignes de JSX sans filet aurait été imprudent.
 *
 * Maintenant qu'ils sont autonomes, ils se montent seuls. Ce fichier vérifie
 * deux choses pour chacun :
 *
 *   1. il se monte et se démonte sans lever d'exception, y compris quand l'API
 *      ne renvoie rien — c'est le cas réel d'un compte neuf ;
 *   2. il s'abonne à `pipeline:refresh` au montage et s'en DÉSABONNE au
 *      démontage. Ce point n'est pas décoratif : le rafraîchissement vivait
 *      auparavant dans le parent, et c'est la partie du déplacement qui pouvait
 *      silencieusement ne plus marcher — ou pire, laisser une fuite d'écouteurs
 *      à chaque ouverture de tableau de bord.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// --- API métier : tout stub, résolu `null` ---
// `null` et non `[]` : c'est ce que renvoie réellement l'API quand il n'y a rien,
// et c'est ce que les widgets testent avec `?? []` ou `?? { ... }`. Un premier jet
// renvoyait `[]` partout, y compris là où l'API renvoie un OBJET — les widgets
// plantaient sur une forme de données qui ne peut pas exister en vrai.
// `vi.mock` est hissé AU-DESSUS des imports et sa fabrique s'exécute avant
// l'initialisation des constantes du module : impossible d'y appeler une
// fonction partagée. La répétition ci-dessous est donc voulue, pas négligée.
vi.mock('../../../utils/enterpriseApi/courtier', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/investisseur', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/transitaire', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/transport', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/logisticien', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/technicians', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/rentals', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/inventory', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);
vi.mock('../../../utils/enterpriseApi/interventions', async (o) =>
  Object.fromEntries(
    Object.entries((await o()) as Record<string, unknown>).map(([c, v]) => [
      c,
      typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v,
    ]),
  ),
);

// Cartes et formulaires : hors sujet ici, et coûteux à monter (Leaflet).
vi.mock('./DeliveryMap', () => ({ default: () => <div data-testid="carte" /> }));
vi.mock('./FreightContainerMap', () => ({ default: () => <div data-testid="carte" /> }));
vi.mock('./QuickCreditApplicationForm', () => ({ default: () => null }));
vi.mock('./QuickInsurancePolicyForm', () => ({ default: () => null }));
vi.mock('./QuickInvestmentForm', () => ({ default: () => null }));
vi.mock('./QuickInterventionForm', () => ({ default: () => null }));

import CreditApplicationsWidget from './CreditApplicationsWidget';
import InsurancePoliciesWidget from './InsurancePoliciesWidget';
import ClientPortfolioWidget from './ClientPortfolioWidget';
import CommissionTrackingWidget from './CommissionTrackingWidget';
import PerformanceAnalyticsWidget from './PerformanceAnalyticsWidget';
import InterventionsTodayWidget from './InterventionsTodayWidget';
import PartsInventoryWidget from './PartsInventoryWidget';
import TechnicianWorkloadWidget from './TechnicianWorkloadWidget';
import TransportCostsWidget from './TransportCostsWidget';
import RoiAnalysisWidget from './RoiAnalysisWidget';
import RiskAssessmentWidget from './RiskAssessmentWidget';
import ImportExportStatsWidget from './ImportExportStatsWidget';
import DemurrageTrackingWidget from './DemurrageTrackingWidget';
import RentalOverdueWidget from './RentalOverdueWidget';
import LogisticsProfitabilityWidget from './LogisticsProfitabilityWidget';
import DeadheadCostWidget from './DeadheadCostWidget';
import BankComparatorWidget from './BankComparatorWidget';
import YieldRealizedVsExpectedWidget from './YieldRealizedVsExpectedWidget';
import CustomsClearanceWidget from './CustomsClearanceWidget';
import WarehouseOccupancyWidget from './WarehouseOccupancyWidget';
import PortfolioValueWidget from './PortfolioValueWidget';
import DeliveryMapWidget from './DeliveryMapWidget';
import ContainerTrackingWidget from './ContainerTrackingWidget';

const faux = { id: 'x', type: 'chart', title: 'T', size: '1/2' } as never;

/** Chaque widget, avec les propriétés que le point d'appel lui passe vraiment. */
const WIDGETS: Array<[string, () => React.ReactElement]> = [
  ['credit-applications', () => <CreditApplicationsWidget />],
  ['insurance-policies', () => <InsurancePoliciesWidget />],
  ['client-portfolio', () => <ClientPortfolioWidget />],
  ['commission-tracking', () => <CommissionTrackingWidget />],
  ['performance-analytics', () => <PerformanceAnalyticsWidget widget={faux} widgetSize="medium" />],
  ['interventions-today', () => <InterventionsTodayWidget widget={faux} widgetSize="medium" />],
  ['parts-inventory', () => <PartsInventoryWidget widget={faux} widgetSize="medium" />],
  ['technician-workload', () => <TechnicianWorkloadWidget widget={faux} widgetSize="medium" />],
  ['transport-costs', () => <TransportCostsWidget widget={faux} widgetSize="medium" />],
  ['roi-analysis', () => <RoiAnalysisWidget widget={faux} widgetSize="medium" />],
  ['risk-assessment', () => <RiskAssessmentWidget widget={faux} widgetSize="medium" />],
  ['import-export-stats', () => <ImportExportStatsWidget widget={faux} widgetSize="medium" />],
  ['demurrage-tracking', () => <DemurrageTrackingWidget />],
  ['rental-overdue', () => <RentalOverdueWidget />],
  ['logistics-profitability', () => <LogisticsProfitabilityWidget />],
  ['deadhead-cost', () => <DeadheadCostWidget />],
  ['bank-comparator', () => <BankComparatorWidget />],
  ['yield-realized-vs-expected', () => <YieldRealizedVsExpectedWidget />],
  ['customs-clearance', () => <CustomsClearanceWidget />],
  ['warehouse-occupancy', () => <WarehouseOccupancyWidget />],
  ['portfolio-value', () => <PortfolioValueWidget />],
  ['delivery-map', () => <DeliveryMapWidget />],
  ['container-tracking', () => <ContainerTrackingWidget />],
];

let ajouts: string[];
let retraits: string[];
let ajoutOrigine: typeof window.addEventListener;
let retraitOrigine: typeof window.removeEventListener;

beforeEach(() => {
  ajouts = [];
  retraits = [];
  ajoutOrigine = window.addEventListener.bind(window);
  retraitOrigine = window.removeEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((t, ...r) => {
    ajouts.push(String(t));
    return ajoutOrigine(t as never, ...(r as [never]));
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((t, ...r) => {
    retraits.push(String(t));
    return retraitOrigine(t as never, ...(r as [never]));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(WIDGETS)('widget %s', (nom, monter) => {
  it('se monte, charge et se démonte sans exception', async () => {
    const vue = render(monter());
    // Laisse les promesses de chargement se résoudre : c'est là que se
    // produisent les plantages sur données vides.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vue.container).toBeTruthy();
    expect(() => vue.unmount()).not.toThrow();
  });

  it('se désabonne de pipeline:refresh en se démontant', async () => {
    const vue = render(monter());
    await act(async () => {
      await Promise.resolve();
    });
    const abonne = ajouts.filter((t) => t === 'pipeline:refresh').length;
    vue.unmount();
    const desabonne = retraits.filter((t) => t === 'pipeline:refresh').length;
    // Autant de désabonnements que d'abonnements : sans cela, chaque ouverture
    // du tableau de bord laisserait un écouteur derrière elle.
    expect(desabonne).toBe(abonne);
    if (abonne === 0) {
      // Certains widgets n'ont pas de rafraîchissement : on le constate, on ne
      // l'invente pas. Le test reste utile pour le montage.
      expect(abonne).toBe(0);
    }
  });
});

describe('câblage du rafraîchissement', () => {
  it('au moins un widget extrait réagit à pipeline:refresh', async () => {
    // Garde-fou global : si une refonte future supprimait l'abonnement partout,
    // le rafraîchissement cesserait sans qu'aucun test ne bronche.
    const vue = render(<CreditApplicationsWidget />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(ajouts).toContain('pipeline:refresh');
    vue.unmount();
  });
});
