import React from 'react';
import { ShieldCheck, ClipboardCheck, Lock, Banknote, Truck, Radar, Database, Brain } from 'lucide-react';
import { EnterPresentationButton } from '../nextgen/ui/PresentationMode';
import TrustScoreWidget from '../nextgen/widgets/TrustScoreWidget';
import { InspectionGradeWidget, InspectionRequestWidget } from '../nextgen/widgets/InspectionWidget';
import EscrowFlowWidget from '../nextgen/widgets/EscrowFlowWidget';
import FinanceSimulator from '../nextgen/finance/FinanceSimulator';
import FinancePrescoringWidget from '../nextgen/widgets/FinancePrescoringWidget';
import LogisticsWidget from '../nextgen/widgets/LogisticsWidget';
import MarketAlertWidget from '../nextgen/widgets/MarketAlertWidget';
import PriceEstimatorWidget from '../nextgen/widgets/PriceEstimatorWidget';
import FraudWidget from '../nextgen/widgets/FraudWidget';

// Page d'accueil NextGen = DÉMONSTRATION, pas description. Chaque bloc est un outil
// interactif qui exécute la vraie logique métier (testée). On ne décrit plus : on montre.
export default function NextGenServices() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Démonstration — l'infrastructure de confiance</h1>
        <p className="mt-2 text-gray-600 max-w-3xl">
          Chaque module ci-dessous est <strong>utilisable en direct</strong> : les calculs
          tournent réellement (score, estimation, fraude, financement, séquestre…). Les
          partenaires (PSP, banques, inspecteurs) ne sont pas encore intégrés — c'est
          indiqué, jamais simulé.
        </p>
        <div className="mt-4"><EnterPresentationButton /></div>
      </header>

      <div className="space-y-8">
        <Block id="trust" name="Trust Layer" Icon={ShieldCheck} href="#nextgen/trust">
          <TrustScoreWidget />
        </Block>

        <Block id="inspection" name="Inspection" Icon={ClipboardCheck} href="#nextgen/inspection">
          <div className="grid lg:grid-cols-2 gap-5">
            <InspectionGradeWidget />
            <InspectionRequestWidget />
          </div>
        </Block>

        <Block id="escrow" name="Escrow" Icon={Lock} href="#nextgen/escrow">
          <EscrowFlowWidget />
        </Block>

        <Block id="finance" name="Finance" Icon={Banknote} href="#nextgen/finance">
          <div className="grid lg:grid-cols-2 gap-5 items-start">
            <FinanceSimulator />
            <FinancePrescoringWidget />
          </div>
        </Block>

        <Block id="logistics" name="Logistics" Icon={Truck} href="#nextgen/logistics">
          <LogisticsWidget />
        </Block>

        <Block id="intelligence" name="Market Intelligence" Icon={Radar} href="#nextgen/intelligence">
          <MarketAlertWidget />
        </Block>

        <Block id="data" name="Data — Estimation de prix" Icon={Database} href="#nextgen/acheter">
          <PriceEstimatorWidget />
        </Block>

        <Block id="ai" name="IA — Détection de fraude" Icon={Brain} href="#nextgen/acheter">
          <FraudWidget />
        </Block>
      </div>
    </div>
  );
}

function Block({
  id, name, Icon, href, children,
}: {
  id: string;
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <span className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary-600" />
          </span>
          {name}
        </h2>
        <a href={href} className="text-sm text-primary-600 hover:underline whitespace-nowrap">Ouvrir le module complet →</a>
      </div>
      {children}
    </section>
  );
}
