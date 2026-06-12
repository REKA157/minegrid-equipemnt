import React from 'react';
import { EnterpriseDashboardShell } from './enterprise-shell';
import { LoueurWidgets } from './widgets/LoueurWidgets';

const WIDGETS_LOUEUR_IDS = [
  'rental-revenue',
  'equipment-availability',
  'upcoming-rentals',
  'rental-pipeline',
  'daily-actions',
  'ai-insights',
  'ai-optimization',
];

const EnterpriseDashboardLoueurDisplay: React.FC = () => (
  <EnterpriseDashboardShell
    role="loueur"
    widgetsSource={LoueurWidgets}
    validIds={WIDGETS_LOUEUR_IDS}
    modalLabel="widget loueur"
  />
);

export default EnterpriseDashboardLoueurDisplay;
