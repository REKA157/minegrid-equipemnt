import React from 'react';

// Kit UI NextGen — STATUTS HONNÊTES partout (anti-façade).
// 'available'  = la fonction tourne réellement (logique embarquée testée)
// 'unverified' = donnée non vérifiée
// 'awaiting_partner'    = nécessite un partenaire signé (PSP, banque, inspecteur)
// 'awaiting_deployment' = code prêt, mais migrations/Edge Functions non déployées
// 'roadmap'    = planifié

export type DemoStatus =
  | 'available'
  | 'unverified'
  | 'awaiting_partner'
  | 'awaiting_deployment'
  | 'roadmap';

const META: Record<DemoStatus, { label: string; cls: string }> = {
  available: { label: 'Disponible', cls: 'bg-green-100 text-green-800 border-green-300' },
  unverified: { label: 'Non vérifié', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  awaiting_partner: { label: 'En attente partenaire', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  awaiting_deployment: { label: 'En attente de déploiement', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  roadmap: { label: 'Roadmap', cls: 'bg-gray-100 text-gray-600 border-gray-300' },
};

export function StatusBadge({ status, className = '' }: { status: DemoStatus; className?: string }) {
  const m = META[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${m.cls} ${className}`}>
      {m.label}
    </span>
  );
}

/** Pastille « calcul réel » pour distinguer les widgets qui exécutent la vraie logique. */
export function LiveTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-medium ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Calcul réel
    </span>
  );
}

export function SectionCard({
  title, status, live, subtitle, children,
}: {
  title: string;
  status?: DemoStatus;
  live?: boolean;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {live && <LiveTag />}
          {status && <StatusBadge status={status} />}
        </div>
      </div>
      {subtitle && <p className="text-sm text-gray-500 mb-3">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

/** État vide HONNÊTE : on n'invente pas de données. */
export function EmptyState({
  status = 'awaiting_deployment', message,
}: {
  status?: DemoStatus;
  message?: string;
}) {
  const fallback =
    status === 'awaiting_partner'
      ? "En attente d'activation partenaire."
      : status === 'awaiting_deployment'
      ? 'Donnée non disponible — déploiement Supabase requis.'
      : 'Donnée non disponible.';
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
      <StatusBadge status={status} className="mb-2" />
      <p className="text-sm text-gray-500">{message ?? fallback}</p>
    </div>
  );
}

/** Bandeau d'honnêteté affiché en tête de l'espace NextGen. */
export function DemoBanner() {
  return (
    <div className="rounded-lg bg-slate-900 text-slate-100 px-4 py-3 text-sm">
      <strong>Démo honnête.</strong> Les widgets « Calcul réel » exécutent la logique
      métier testée localement (aucune donnée fictive). Les sections de données live
      restent vides tant que les migrations/Edge Functions ne sont pas déployées et que
      les partenaires (PSP, banques, inspecteurs) ne sont pas signés — c'est indiqué
      explicitement, jamais simulé.
    </div>
  );
}

/** Petit champ numérique réutilisable pour les widgets interactifs. */
export function NumberField({
  label, value, onChange, min, max, step = 1,
}: {
  label: string; value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-700">{label}</span>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 rounded-md border border-gray-300 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}

export function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
      {label}
    </label>
  );
}
