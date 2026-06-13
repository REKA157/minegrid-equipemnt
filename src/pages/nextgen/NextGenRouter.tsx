import React from 'react';
import NextGenLayout from './NextGenLayout';
import NextGenServices from '../NextGenServices';
import BuyWithConfidence from './BuyWithConfidence';
import SellWithVerification from './SellWithVerification';
import TrustDashboard from './TrustDashboard';
import InspectionDashboard from './InspectionDashboard';
import EscrowDashboard from './EscrowDashboard';
import FinanceDashboard from './FinanceDashboard';
import LogisticsDashboard from './LogisticsDashboard';
import MarketIntelligenceDashboard from './MarketIntelligenceDashboard';

export default function NextGenRouter({ sub }: { sub?: string }) {
  const key = sub ?? '';
  const page = (() => {
    switch (key) {
      case 'acheter': return <BuyWithConfidence />;
      case 'vendre': return <SellWithVerification />;
      case 'trust': return <TrustDashboard />;
      case 'inspection': return <InspectionDashboard />;
      case 'escrow': return <EscrowDashboard />;
      case 'finance': return <FinanceDashboard />;
      case 'logistics': return <LogisticsDashboard />;
      case 'intelligence': return <MarketIntelligenceDashboard />;
      default: return <NextGenServices />;
    }
  })();
  return <NextGenLayout active={key}>{page}</NextGenLayout>;
}
