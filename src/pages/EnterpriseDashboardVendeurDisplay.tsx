import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { VendeurWidgets } from './widgets/VendeurWidgets';

// Catalogue COMPLET des widgets vendeur (ce qui reste ajoutable via « + Ajouter des widgets »).
const WIDGETS_VENDEUR_IDS = [
  'sales-performance-score',
  'stock-status',
  'sales-evolution',
  'sales-pipeline',
  'transaction-cases',
  'daily-actions',
  'ai-insights',
  'ai-optimization',
];

// Dashboard par défaut ÉPURÉ « quoi faire maintenant » (ordre = ordre d'affichage) :
// Actions en PRINCIPAL, puis stock, score, évolution, recommandations IA. Le Pipeline,
// les Dossiers et l'Optimisation IA restent ajoutables à la demande (secondaires).
const WIDGETS_VENDEUR_DEFAULT = [
  'daily-actions',
  'stock-status',
  'sales-performance-score',
  'sales-evolution',
  'ai-insights',
];

const EnterpriseDashboardVendeurDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="vendeur"
    widgetsSource={VendeurWidgets}
    validIds={WIDGETS_VENDEUR_IDS}
    defaultActiveIds={WIDGETS_VENDEUR_DEFAULT}
    modalLabel="widget vendeur"
  />
);

export default EnterpriseDashboardVendeurDisplay;
