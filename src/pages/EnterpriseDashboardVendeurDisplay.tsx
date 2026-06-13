import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { VendeurWidgets } from './widgets/VendeurWidgets';

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

const EnterpriseDashboardVendeurDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="vendeur"
    widgetsSource={VendeurWidgets}
    validIds={WIDGETS_VENDEUR_IDS}
    modalLabel="widget vendeur"
  />
);

export default EnterpriseDashboardVendeurDisplay;
