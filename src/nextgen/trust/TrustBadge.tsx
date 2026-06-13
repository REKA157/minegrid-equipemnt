import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { TrustTier } from './types';

const TIER_META: Record<TrustTier, { label: string; classes: string; icon: 'check' | 'alert' | 'question' }> = {
  elite:      { label: 'Confiance Élite',  classes: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: 'check' },
  trusted:    { label: 'Vendeur de confiance', classes: 'bg-green-100 text-green-800 border-green-300', icon: 'check' },
  verified:   { label: 'Vérifié',          classes: 'bg-blue-100 text-blue-800 border-blue-300',       icon: 'check' },
  basic:      { label: 'Identité partielle', classes: 'bg-amber-100 text-amber-800 border-amber-300',  icon: 'alert' },
  unverified: { label: 'Non vérifié',      classes: 'bg-gray-100 text-gray-600 border-gray-300',       icon: 'question' },
};

interface TrustBadgeProps {
  tier: TrustTier;
  score?: number;
  size?: 'sm' | 'md';
}

/**
 * Badge de confiance public. C'est le signal n°1 de la marketplace : il rend
 * VISIBLE et comparable la fiabilité d'un vendeur, ce que ni le canal informel
 * (WhatsApp) ni les marketplaces de listing n'offrent.
 */
export default function TrustBadge({ tier, score, size = 'md' }: TrustBadgeProps) {
  const meta = TIER_META[tier];
  const Icon = meta.icon === 'check' ? ShieldCheck : meta.icon === 'alert' ? ShieldAlert : ShieldQuestion;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <span
      role="status"
      aria-label={`Niveau de confiance : ${meta.label}${typeof score === 'number' ? `, score ${score} sur 100` : ''}`}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${pad} ${meta.classes}`}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {meta.label}
      {typeof score === 'number' && <span className="opacity-70">· {score}</span>}
    </span>
  );
}
