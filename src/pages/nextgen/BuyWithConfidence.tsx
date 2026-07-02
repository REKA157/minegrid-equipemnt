import React from 'react';
import { StatusBadge, type DemoStatus } from '../../nextgen/ui/primitives';
import PriceEstimatorWidget from '../../nextgen/widgets/PriceEstimatorWidget';
import FraudWidget from '../../nextgen/widgets/FraudWidget';

const STEPS: Array<{ n: number; title: string; desc: string; status: DemoStatus }> = [
  { n: 1, title: 'Trouver l’équipement', desc: 'Catalogue filtrable par marque/année/pays.', status: 'awaiting_deployment' },
  { n: 2, title: 'Vérifier le vendeur', desc: 'Badge de confiance + vérifications (Trust Layer).', status: 'available' },
  { n: 3, title: 'Estimer le juste prix', desc: 'Référentiel de prix propriétaire (estimation live ci-dessous).', status: 'available' },
  { n: 4, title: 'Détecter la fraude', desc: 'Signaux de risque (prix appât, vendeur non vérifié…).', status: 'available' },
  { n: 5, title: 'Inspecter la machine', desc: 'Rapport certifié par un inspecteur au sol.', status: 'awaiting_partner' },
  { n: 6, title: 'Séquestrer le paiement', desc: 'Paiement sécurisé conditionné inspection + livraison — opérateur PSP à venir (non encore activé).', status: 'awaiting_partner' },
  { n: 7, title: 'Financer (optionnel)', desc: 'Dossier scoré transmis à une banque partenaire.', status: 'awaiting_partner' },
  { n: 8, title: 'Livrer & dédouaner', desc: 'Devis transport + transit.', status: 'awaiting_partner' },
];

export default function BuyWithConfidence() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Acheter en confiance</h1>
        <p className="text-gray-600">Le parcours qui transforme un achat d'engin à distance risqué en transaction sécurisée.</p>
      </header>

      <ol className="grid sm:grid-cols-2 gap-3">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">{s.n}</span>
                <span className="font-medium text-gray-900">{s.title}</span>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-1 ml-8 text-sm text-gray-500">{s.desc}</p>
          </li>
        ))}
      </ol>

      <PriceEstimatorWidget />
      <FraudWidget />
    </div>
  );
}
