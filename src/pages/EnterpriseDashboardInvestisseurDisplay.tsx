import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { InvestisseurWidgets } from './widgets/InvestisseurWidgets';

const WIDGETS_INVESTISSEUR_IDS = [
  'portfolio-value',
  'investment-opportunities',
  'roi-analysis',
  'risk-assessment',
  'opportunities',
  'transaction-cases',
];

const EnterpriseDashboardInvestisseurDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="investisseur"
    widgetsSource={InvestisseurWidgets}
    validIds={WIDGETS_INVESTISSEUR_IDS}
    modalLabel="widget investisseur"
  />
);

export default EnterpriseDashboardInvestisseurDisplay;
