import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { CourtierWidgets } from './widgets/CourtierWidgets';

const WIDGETS_COURTIER_IDS = [
  'credit-applications',
  'insurance-policies',
  'commission-tracking',
  'client-portfolio',
  'performance-analytics',
  'transaction-cases',
];

const EnterpriseDashboardCourtierDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="courtier"
    widgetsSource={CourtierWidgets}
    validIds={WIDGETS_COURTIER_IDS}
    modalLabel="widget courtier"
  />
);

export default EnterpriseDashboardCourtierDisplay;
