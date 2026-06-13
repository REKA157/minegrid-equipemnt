import React from 'react';
import { ClipboardCheck, Lock, Banknote, Truck } from 'lucide-react';
import { StatusBadge } from '../ui/primitives';

// Options de transaction dans le tunnel de devis. Le buyer EXPRIME un intérêt
// (sélection informative jointe à la demande) — AUCUNE transaction n'est engagée,
// aucun paiement simulé. Chaque service est honnêtement marqué « en attente
// partenaire » tant qu'il n'est pas opérationnel.
const OPTIONS = [
  { key: 'Inspection certifiée', icon: ClipboardCheck, desc: 'Inspection sur site avant achat' },
  { key: 'Paiement sécurisé (séquestre)', icon: Lock, desc: 'Fonds libérés après inspection + livraison' },
  { key: 'Financement', icon: Banknote, desc: 'Dossier transmis à un partenaire bancaire' },
  { key: 'Transport & dédouanement', icon: Truck, desc: 'Devis logistique porte-à-porte' },
];

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
}

export default function TransactionOptionsPanel({ value, onChange }: Props) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-700">Services souhaités (optionnel)</p>
      <p className="text-xs text-gray-400 mb-2">
        Indiquez votre intérêt : ces services seront activés avec nos partenaires.
        Aucune transaction n'est engagée à cette étape.
      </p>
      <div className="space-y-1.5">
        {OPTIONS.map(({ key, icon: Icon, desc }) => (
          <label key={key} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
            <span className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={value.includes(key)}
                onChange={() => toggle(key)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <Icon className="h-4 w-4 text-gray-400" />
              <span title={desc}>{key}</span>
            </span>
            <StatusBadge status="awaiting_partner" />
          </label>
        ))}
      </div>
    </div>
  );
}
