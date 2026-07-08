import React, { useEffect, useRef, useState } from 'react';
import { Info, X, Lightbulb, ListChecks } from 'lucide-react';

/** Explication détaillée d'un widget (affichée au CLIC sur le « i »). */
export interface WidgetExplanation {
  /** Résumé clair en une ou deux phrases. */
  summary: string;
  /** Comment ça marche / comment le lire (puces courtes). */
  howItWorks: string[];
  /** Ce que l'utilisateur peut faire (optionnel). */
  whatToDo?: string[];
}

interface InfoTooltipProps {
  /** Phrase courte affichée au SURVOL. */
  text: string;
  /** Titre de la fenêtre détaillée (souvent le nom du widget). */
  title?: string;
  /** Explication détaillée affichée au CLIC. Si absente, le clic montre `text`. */
  details?: WidgetExplanation;
  label?: string;
  className?: string;
}

type Mode = 'closed' | 'hover' | 'open';

/**
 * Petit « i » d'aide à deux niveaux :
 *  - SURVOL (desktop) -> bulle courte rappelant le rôle du widget ;
 *  - CLIC / TAP -> fenêtre détaillée « comment ça marche » en langage clair.
 * Placé dans une poignée de drag : on stoppe le mousedown pour ne pas déplacer
 * la carte. La fenêtre détaillée est en overlay plein écran (aucun rognage dans
 * les petites cartes) et se ferme au clic extérieur, au bouton ou avec Échap.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  title,
  details,
  label = 'À quoi sert ce widget ?',
  className = '',
}) => {
  const [mode, setMode] = useState<Mode>('closed');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (mode !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('closed');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex shrink-0 ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={mode === 'open'}
        onMouseEnter={() => setMode((m) => (m === 'open' ? m : 'hover'))}
        onMouseLeave={() => setMode((m) => (m === 'hover' ? 'closed' : m))}
        onClick={(e) => {
          e.stopPropagation();
          setMode((m) => (m === 'open' ? 'closed' : 'open'));
        }}
        className="p-0.5 text-gray-400 hover:text-orange-600 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {/* Niveau 1 : bulle courte au survol */}
      {mode === 'hover' && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 w-56 max-w-[70vw] rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case leading-snug text-white shadow-lg"
        >
          {text}
          <span className="mt-1 block text-[10px] text-gray-300">Cliquez pour en savoir plus →</span>
        </span>
      )}

      {/* Niveau 2 : fenêtre détaillée au clic (overlay plein écran) */}
      {mode === 'open' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            // clic sur le fond -> fermer (mais pas clic dans la carte)
            if (e.target === e.currentTarget) setMode('closed');
          }}
        >
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Info className="h-4 w-4 text-orange-600 shrink-0" />
                {title ? `À quoi sert : ${title}` : 'À quoi sert ce widget ?'}
              </h3>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setMode('closed')}
                className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-gray-700">{details?.summary || text}</p>

            {details?.howItWorks?.length ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Lightbulb className="h-3.5 w-3.5 text-orange-500" /> Comment ça marche
                </div>
                <ul className="space-y-1.5">
                  {details.howItWorks.map((line, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                      <span className="leading-snug">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {details?.whatToDo?.length ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <ListChecks className="h-3.5 w-3.5 text-green-600" /> Ce que vous pouvez faire
                </div>
                <ul className="space-y-1.5">
                  {details.whatToDo.map((line, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      <span className="leading-snug">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setMode('closed')}
              className="mt-5 w-full rounded-lg bg-orange-600 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </span>
  );
};

export default InfoTooltip;
