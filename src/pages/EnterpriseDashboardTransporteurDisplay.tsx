import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { TransporteurWidgets } from './widgets/TransporteurWidgets';

const WIDGETS_TRANSPORTEUR_IDS = [
  'active-deliveries',
  'delivery-map',
  'transport-costs',
  'driver-schedule',
  'deadhead-cost',
  // 'tx-assigned-transports' : widget planifié, volontairement exclu tant que non branché
  // (voir widgets/plannedEnterpriseWidgets.ts + docs/PLANNED_ENTERPRISE_WIDGETS.md)
];

const EnterpriseDashboardTransporteurDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="transporteur"
    widgetsSource={TransporteurWidgets}
    validIds={WIDGETS_TRANSPORTEUR_IDS}
    modalLabel="widget transporteur"
  />
);

export default EnterpriseDashboardTransporteurDisplay;
