import React from 'react';
import { DemoBanner } from '../../nextgen/ui/primitives';

const NAV: Array<{ key: string; label: string }> = [
  { key: '', label: 'Vue d’ensemble' },
  { key: 'acheter', label: 'Acheter en confiance' },
  { key: 'vendre', label: 'Vendre avec vérification' },
  { key: 'trust', label: 'Trust Layer' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'escrow', label: 'Escrow' },
  { key: 'finance', label: 'Finance' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'intelligence', label: 'Market Intelligence' },
];

export default function NextGenLayout({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <DemoBanner />
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <nav className="lg:sticky lg:top-4 self-start">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const href = item.key ? `#nextgen/${item.key}` : '#nextgen';
              const isActive = (active || '') === item.key;
              return (
                <li key={item.key || 'home'}>
                  <a
                    href={href}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? 'bg-primary-600 text-white font-medium' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
