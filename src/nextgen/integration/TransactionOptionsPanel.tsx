import React from 'react';
import { ClipboardCheck, Lock, Banknote, Truck } from 'lucide-react';
import { StatusBadge } from '../ui/primitives';

// Options de transaction INLINE dans le formulaire de devis (pas un panneau séparé).
// Le buyer exprime un intérêt joint à sa demande — AUCUNE transaction, aucun paiement.
const OPTIONS = [
  { key: 'Inspection certifiée', icon: ClipboardCheck },
  { key: 'Paiement sécurisé (séquestre)', icon: Lock },
  { key: 'Financement', icon: Banknote },
  { key: 'Transport & dédouanement', icon: Truck },
];

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
}

export default function TransactionOptionsPanel({ value, onChange }: Props) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <fieldset>
      <legend className="text-sm text-gray-700">Services souhaités (optionnel)</legend>
      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {OPTIONS.map(({ key, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
            <span className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={value.includes(key)}
                onChange={() => toggle(key)}
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <Icon className="h-4 w-4 text-gray-400" />
              {key}
            </span>
            <StatusBadge status="awaiting_partner" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
