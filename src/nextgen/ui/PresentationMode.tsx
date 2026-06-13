import React, { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { isDemoBackend, isPresentationMode, setPresentationMode } from './demoMode';

function usePresentationState() {
  const [on, setOn] = useState(() => isPresentationMode());
  useEffect(() => {
    const sync = () => setOn(isPresentationMode());
    window.addEventListener('presentationModeChanged', sync);
    return () => window.removeEventListener('presentationModeChanged', sync);
  }, []);
  return on;
}

/**
 * Bandeau PERMANENT affiché tant que le mode présentation est actif. Rend la démo
 * honnête : il dit explicitement que les données ne sont pas réelles et qu'aucun
 * paiement n'a lieu. Affiché en haut de toutes les pages.
 */
export function PresentationRibbon() {
  const on = usePresentationState();
  if (!on) return null;
  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <strong>Mode présentation</strong> — navigation de démonstration. Aucune donnée
          réelle, aucun paiement, aucun compte réel.
        </span>
        <button
          onClick={() => setPresentationMode(false)}
          className="inline-flex items-center gap-1 rounded-md bg-amber-950/10 px-2 py-1 hover:bg-amber-950/20"
        >
          <X className="h-3.5 w-3.5" /> Quitter
        </button>
      </div>
    </div>
  );
}

/**
 * Bouton d'activation du mode présentation. N'apparaît QUE si le backend est un
 * placeholder (démo) et que le mode n'est pas déjà actif — sinon rien (inerte en prod).
 */
export function EnterPresentationButton({ className = '' }: { className?: string }) {
  const on = usePresentationState();
  if (!isDemoBackend() || on) return null;
  return (
    <button
      onClick={() => setPresentationMode(true)}
      className={`inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 ${className}`}
    >
      <Eye className="h-4 w-4" />
      Explorer en mode présentation (sans compte)
    </button>
  );
}
