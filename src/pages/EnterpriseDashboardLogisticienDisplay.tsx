import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { LogisticienWidgets } from './widgets/LogisticienWidgets';

const WIDGETS_LOGISTICIEN_IDS = [
  'warehouse-occupancy',
  'route-optimization',
  'supply-chain-kpis',
  'inventory-alerts',
  'logistics-profitability',
  'transaction-cases',
];

const EnterpriseDashboardLogisticienDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="logisticien"
    widgetsSource={LogisticienWidgets}
    validIds={WIDGETS_LOGISTICIEN_IDS}
    defaultActiveIds={WIDGETS_LOGISTICIEN_IDS}
    modalLabel="widget logisticien"
  />
);

export default EnterpriseDashboardLogisticienDisplay;
