import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { TransitaireWidgets } from './widgets/TransitaireWidgets';

const WIDGETS_TRANSITAIRE_IDS = [
  'customs-clearance',
  'container-tracking',
  'demurrage-tracking',
  'import-export-stats',
  'document-status',
  'transaction-cases',
];

const EnterpriseDashboardTransitaireDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="transitaire"
    widgetsSource={TransitaireWidgets}
    validIds={WIDGETS_TRANSITAIRE_IDS}
    defaultActiveIds={WIDGETS_TRANSITAIRE_IDS}
    modalLabel="widget transitaire"
  />
);

export default EnterpriseDashboardTransitaireDisplay;
