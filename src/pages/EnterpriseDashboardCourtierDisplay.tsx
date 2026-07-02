import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { CourtierWidgets } from './widgets/CourtierWidgets';

const WIDGETS_COURTIER_IDS = [
  'credit-applications',
  'insurance-policies',
  'commission-tracking',
  'client-portfolio',
  'performance-analytics',
  'bank-comparator',
  'transaction-cases',
  // 'transaction-broker-financing' : widget planifié, volontairement exclu tant que non branché
  // (voir widgets/plannedEnterpriseWidgets.ts + docs/PLANNED_ENTERPRISE_WIDGETS.md)
];

const EnterpriseDashboardCourtierDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="courtier"
    widgetsSource={CourtierWidgets}
    validIds={WIDGETS_COURTIER_IDS}
    defaultActiveIds={WIDGETS_COURTIER_IDS}
    modalLabel="widget courtier"
  />
);

export default EnterpriseDashboardCourtierDisplay;
