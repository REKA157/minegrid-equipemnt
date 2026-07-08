/**
 * Assistant pas-à-pas générique.
 *
 * Découpe un long formulaire en étapes courtes : barre d'avancement
 * cliquable, validation par étape (bloque « Suivant » tant que les champs
 * requis manquent), navigation clavier-friendly. Utilisé par la création
 * d'opportunité et le cahier des charges.
 */

import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from './ui';

export interface WizardStep {
  id: string;
  title: string;
  /** Consigne courte affichée sous le titre — que faire à cette étape. */
  hint?: string;
  content: React.ReactNode;
  /** Retourne un message d'erreur si l'étape est incomplète, sinon null. */
  validate?: () => string | null;
}

export function Wizard({
  steps,
  onFinish,
  finishLabel = 'Générer',
  busy,
}: {
  steps: WizardStep[];
  onFinish: () => void;
  finishLabel?: string;
  busy?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));

  const step = steps[current];
  const isLast = current === steps.length - 1;

  const goTo = (index: number) => {
    // On peut revenir en arrière librement ; en avant, uniquement sur une
    // étape déjà visitée (sinon passer par « Suivant » qui valide).
    if (index > current && !visited.has(index)) return;
    setError(null);
    setCurrent(index);
  };

  const next = () => {
    const message = step.validate?.() ?? null;
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    if (isLast) {
      onFinish();
      return;
    }
    const nextIndex = current + 1;
    setVisited((v) => new Set(v).add(nextIndex));
    setCurrent(nextIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const prev = () => {
    setError(null);
    if (current > 0) setCurrent(current - 1);
  };

  return (
    <div>
      {/* Frise des étapes */}
      <ol className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= current || visited.has(i);
          return (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => goTo(i)}
                disabled={!reachable}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary-600 text-white'
                    : done
                      ? 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                      : reachable
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                }`}
                title={s.title}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px]">
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline max-w-[130px] truncate">{s.title}</span>
              </button>
              {i < steps.length - 1 && <span className="mx-0.5 text-gray-300">—</span>}
            </li>
          );
        })}
      </ol>

      {/* Contenu de l'étape */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Étape {current + 1} / {steps.length} — {step.title}
        </h2>
        {step.hint && <p className="mt-1 text-sm text-gray-500">{step.hint}</p>}
        <div className="mt-5">{step.content}</div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <SecondaryButton onClick={prev} disabled={current === 0 || busy}>
            <ArrowLeft className="h-4 w-4" /> Précédent
          </SecondaryButton>
          <PrimaryButton onClick={next} disabled={busy}>
            {busy ? (
              'Génération en cours…'
            ) : isLast ? (
              <>
                <Check className="h-4 w-4" /> {finishLabel}
              </>
            ) : (
              <>
                Suivant <ArrowRight className="h-4 w-4" />
              </>
            )}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
