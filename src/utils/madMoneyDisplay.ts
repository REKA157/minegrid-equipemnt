import type { Currency } from '../types';

/**
 * Montants agrégés vendeur (offres × estimation, pipeline) sont stockés en MAD.
 * Les taux du store sont « unités de devise pour 1 EUR », comme dans Price.tsx.
 */
export function madToDisplayAmount(
  mad: number,
  currency: Currency,
  rates: Record<Currency, number>,
): number {
  const madPerEur = rates.MAD;
  if (!madPerEur || madPerEur <= 0) return mad;
  const eur = mad / madPerEur;
  const perEur = rates[currency];
  if (!perEur || perEur <= 0) return mad;
  return eur * perEur;
}

const currencyFormats: Partial<Record<Currency, Intl.NumberFormatOptions>> = {
  EUR: { style: 'currency', currency: 'EUR' },
  USD: { style: 'currency', currency: 'USD' },
  MAD: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  XOF: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  XAF: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  NGN: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  ZAR: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  EGP: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  KES: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  GHS: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
};

const currencySymbols: Record<Currency, string> = {
  EUR: '€',
  USD: '$',
  MAD: 'MAD',
  XOF: 'CFA',
  XAF: 'CFA',
  NGN: '₦',
  ZAR: 'R',
  EGP: 'E£',
  KES: 'KSh',
  GHS: 'GH₵',
};

/** Formate une valeur déjà exprimée dans la devise d'affichage choisie. */
export function formatDisplayMoney(
  amount: number,
  currency: Currency,
  locale = 'fr-FR',
): string {
  const options = currencyFormats[currency] || {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  };
  const formatted = new Intl.NumberFormat(locale, options).format(amount);
  if (options.style === 'currency') return formatted;
  return `${formatted} ${currencySymbols[currency]}`;
}

export function formatMadMoney(
  mad: number,
  currency: Currency,
  rates: Record<Currency, number>,
  locale = 'fr-FR',
): string {
  return formatDisplayMoney(madToDisplayAmount(mad, currency, rates), currency, locale);
}
