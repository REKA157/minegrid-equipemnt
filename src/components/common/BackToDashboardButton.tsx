import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BackToDashboardButtonProps {
  /** Cible du retour. Défaut : tableau de bord entreprise. */
  href?: string;
  className?: string;
}

/**
 * Bouton « Retour au tableau de bord » UNIFORME pour toutes les pages de service
 * (Vitrine, Publication, Devis, Documents, Messagerie, Planning…). Même libellé,
 * même style, même cible — à placer en HAUT À GAUCHE de l'en-tête de la page.
 */
export default function BackToDashboardButton({
  href = '#dashboard-entreprise-display',
  className = '',
}: BackToDashboardButtonProps) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 no-underline shadow-sm transition-colors hover:border-orange-300 hover:text-orange-700 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      Retour au tableau de bord
    </a>
  );
}
