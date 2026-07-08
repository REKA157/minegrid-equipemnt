import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  /** Phrase courte expliquant à quoi sert l'élément. */
  text: string;
  /** Libellé accessible du bouton. */
  label?: string;
  className?: string;
}

/**
 * Petit « i » d'aide : au SURVOL (desktop) ou au TAP (mobile) il affiche une
 * phrase courte. Autonome (aucune dépendance), se ferme au clic extérieur.
 * Placé dans une poignée de drag : on stoppe le mousedown pour ne pas déclencher
 * un déplacement de carte.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  label = 'À quoi sert ce widget ?',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex shrink-0 ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-0.5 text-gray-400 hover:text-orange-600 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 w-56 max-w-[70vw] rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case leading-snug text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
};

export default InfoTooltip;
