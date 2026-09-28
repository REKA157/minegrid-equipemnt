import React from 'react';
import { Star, Zap, Shield, Clock } from 'lucide-react';
import { PremiumFeatures } from '../types';

interface PremiumBadgeProps {
  premium: PremiumFeatures;
  className?: string;
}

/** Un badge premium affiché : son icône, son libellé, ses classes de couleur et son infobulle. */
interface BadgePremiumAffiche {
  icon: React.ReactElement;
  text: string;
  color: string;
  tooltip: string;
}

export default function PremiumBadge({ premium, className = "" }: PremiumBadgeProps) {
  const badges: BadgePremiumAffiche[] = [];

  // Badge Boosté
  if (premium.isBoosted) {
    badges.push({
      icon: <Zap className="h-3 w-3" />,
      text: 'Boosté',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      tooltip: `Boosté jusqu'au ${new Date(premium.boostExpiry || '').toLocaleDateString('fr-FR')}`
    });
  }

  // Badge Mis en avant
  if (premium.isHighlighted) {
    badges.push({
      icon: <Star className="h-3 w-3" />,
      text: 'Mis en avant',
      color: 'bg-purple-100 text-purple-800 border-purple-200',
      tooltip: `Mis en avant jusqu'au ${new Date(premium.highlightExpiry || '').toLocaleDateString('fr-FR')}`
    });
  }

  // Badge Certifié
  if (premium.isCertified) {
    badges.push({
      icon: <Shield className="h-3 w-3" />,
      text: 'Certifiée',
      color: 'bg-green-100 text-green-800 border-green-200',
      tooltip: `Machine contrôlée le ${new Date(premium.certificationDate || '').toLocaleDateString('fr-FR')}`
    });
  }

  // Badge Urgent
  if (premium.isUrgent) {
    badges.push({
      icon: <Clock className="h-3 w-3" />,
      text: 'Urgent',
      color: 'bg-red-100 text-red-800 border-red-200',
      tooltip: 'Vente urgente - Prix réduit'
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {badges.map((badge, index) => (
        <div
          key={index}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.color}`}
          title={badge.tooltip}
        >
          {badge.icon}
          {badge.text}
        </div>
      ))}
    </div>
  );
} 