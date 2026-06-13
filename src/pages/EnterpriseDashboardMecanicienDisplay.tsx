import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { MecanicienWidgets } from './widgets/MecanicienWidgets';

const WIDGETS_MECANICIEN_IDS = [
  'interventions-today',
  'repair-status',
  'parts-inventory',
  'technician-workload',
  // 'tx-assigned-inspections' : widget planifié, volontairement exclu tant que non branché
  // (voir widgets/plannedEnterpriseWidgets.ts + docs/PLANNED_ENTERPRISE_WIDGETS.md)
];

const EnterpriseDashboardMecanicienDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="mecanicien"
    widgetsSource={MecanicienWidgets}
    validIds={WIDGETS_MECANICIEN_IDS}
    modalLabel="widget mécanicien"
  />
);

export default EnterpriseDashboardMecanicienDisplay;
