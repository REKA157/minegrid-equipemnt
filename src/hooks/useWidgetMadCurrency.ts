import { useCallback } from 'react';
import { useCurrencyStore } from '../stores/currencyStore';
import { formatMadMoney, madToDisplayAmount } from '../utils/madMoneyDisplay';

/**
 * Formate les montants agrégés vendeur (base MAD) selon la devise détectée / le store.
 * S’abonne au store pour re-render au changement de devise.
 */
export function useWidgetMadCurrency() {
  const currentCurrency = useCurrencyStore((s) => s.currentCurrency);
  const rates = useCurrencyStore((s) => s.rates);

  const formatCurrency = useCallback(
    (amountMad: number) => formatMadMoney(amountMad, currentCurrency, rates),
    [currentCurrency, rates],
  );

  const madToDisplay = useCallback(
    (amountMad: number) => madToDisplayAmount(amountMad, currentCurrency, rates),
    [currentCurrency, rates],
  );

  return { formatCurrency, madToDisplay, currentCurrency, rates };
}
