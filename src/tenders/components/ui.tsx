/**
 * Kit UI du module Appels d'offres.
 *
 * Règle UX du module : chaque écran doit répondre à « Où suis-je ? »
 * (PageHeader), « Que dois-je faire ? » (description + EmptyState utiles)
 * et « Quel est le prochain bouton utile ? » (action principale unique,
 * toujours visible en haut à droite).
 */

import React, { useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import type {
  DocumentStatus,
  RequirementCoverage,
  RequirementLevel,
  TenderStatus,
} from '../types';
import {
  REQUIREMENT_COVERAGE_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  TENDER_STATUS_LABELS,
  daysUntil,
  formatDate,
} from '../types';

// ---------------------------------------------------------------------------
// En-tête de page
// ---------------------------------------------------------------------------

export function PageHeader({
  overline,
  title,
  description,
  action,
  secondaryAction,
}: {
  /** Fil d'Ariane court : « Appels d'offres › AO n° 17/2026 » */
  overline?: string;
  title: string;
  /** Une phrase : ce que l'utilisateur doit faire sur cet écran. */
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
      <div className="min-w-0">
        {overline && (
          <div className="text-xs font-medium uppercase tracking-wide text-primary-700 mb-1">
            {overline}
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
        {description && <p className="text-sm text-gray-600 mt-1 max-w-2xl">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {secondaryAction}
        {action}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

export function PrimaryButton({
  children,
  onClick,
  disabled,
  title,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cartes & structure
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${
        onClick ? 'cursor-pointer hover:border-primary-300 hover:shadow transition-all' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// États vides utiles
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  /** Explique concrètement quoi faire, pas juste « aucune donnée ». */
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-gray-400">{icon}</div>}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 max-w-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aide contextuelle
// ---------------------------------------------------------------------------

export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle ml-1">
      <HelpCircle className="h-3.5 w-3.5 text-gray-400 cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

/** Bandeau d'aide « mode assistant » en haut d'un écran complexe. */
export function GuideBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
      {children}
    </div>
  );
}

export function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------

export function Field({
  label,
  help,
  required,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {help && <HelpTip text={help} />}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={props.rows ?? 4}
      {...props}
      className={`${inputClass} resize-y ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

// ---------------------------------------------------------------------------
// Badges de statut
// ---------------------------------------------------------------------------

/**
 * PALETTE SOBRE (ton pro, pas d'arc-en-ciel) — la couleur encode un SENS,
 * pas une identité d'étape :
 *   gris   = neutre / clos sans enjeu (brouillon, abandonné)
 *   orange = dossier EN COURS (teinte marque, renforcée à l'approche du dépôt)
 *   ambre  = attention requise (à compléter)
 *   vert   = succès (gagné) · rouge = échec (perdu) — uniquement les issues.
 */
const TENDER_STATUS_STYLES: Record<TenderStatus, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  en_analyse: 'bg-primary-50 text-primary-800',
  a_completer: 'bg-amber-50 text-amber-800',
  en_redaction: 'bg-primary-50 text-primary-800',
  en_validation: 'bg-primary-50 text-primary-800',
  pret_a_deposer: 'bg-primary-100 text-primary-800',
  depose: 'bg-primary-100 text-primary-800',
  gagne: 'bg-green-100 text-green-800',
  perdu: 'bg-red-100 text-red-700',
  abandonne: 'bg-gray-200 text-gray-500',
};

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TENDER_STATUS_STYLES[status]}`}
    >
      {TENDER_STATUS_LABELS[status]}
    </span>
  );
}

export function CoverageBadge({ status }: { status: RequirementCoverage }) {
  const map: Record<RequirementCoverage, string> = {
    // Vert/ambre/rouge = état de conformité (sémantique) ; « à traiter » est
    // neutre — le bleu ajoutait une teinte décorative de plus pour rien.
    conforme: 'bg-green-100 text-green-800',
    partiel: 'bg-amber-100 text-amber-800',
    a_traiter: 'bg-gray-100 text-gray-600',
    non_conforme: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>
      {REQUIREMENT_COVERAGE_LABELS[status]}
    </span>
  );
}

export function LevelBadge({ level }: { level: RequirementLevel }) {
  const map: Record<RequirementLevel, string> = {
    imperatif: 'bg-red-50 text-red-700 border border-red-200',
    important: 'bg-amber-50 text-amber-700 border border-amber-200',
    souhaitable: 'bg-gray-50 text-gray-500 border border-gray-200',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${map[level]}`}>
      {REQUIREMENT_LEVEL_LABELS[level]}
    </span>
  );
}

export function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const map: Record<DocumentStatus, { label: string; cls: string }> = {
    brouillon: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
    en_validation: { label: 'En validation', cls: 'bg-primary-50 text-primary-800' },
    valide: { label: 'Validé', cls: 'bg-green-100 text-green-800' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

/**
 * Échéance colorée selon l'URGENCE uniquement (rouge ≤ 3 j, ambre ≤ 10 j).
 * Une échéance lointaine est NEUTRE, pas « verte » : le vert est réservé aux
 * succès — une date à J-40 n'en est pas un.
 */
export function DeadlineBadge({ date }: { date: string }) {
  const days = daysUntil(date);
  const cls =
    days < 0
      ? 'bg-gray-200 text-gray-600'
      : days <= 3
        ? 'bg-red-100 text-red-700'
        : days <= 10
          ? 'bg-amber-100 text-amber-800'
          : 'bg-gray-100 text-gray-600';
  const label =
    days < 0
      ? `Échue (${formatDate(date)})`
      : days === 0
        ? "Aujourd'hui !"
        : `J-${days} — ${formatDate(date)}`;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Barre de progression
// ---------------------------------------------------------------------------

export function ProgressBar({ value, colorClass }: { value: number; colorClass?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all ${colorClass ?? 'bg-primary-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale simple
// ---------------------------------------------------------------------------

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-xl bg-white p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-sm text-gray-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onCancel}>Annuler</SecondaryButton>
        <DangerButton onClick={onConfirm}>{confirmLabel}</DangerButton>
      </div>
    </Modal>
  );
}
