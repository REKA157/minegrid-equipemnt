import { useCurrencyStore } from '../stores/currencyStore';
import { formatMadMoney } from './madMoneyDisplay';

/**
 * Montants dashboard vendeur en base MAD → devise du store (détection IP / sélecteur).
 * Pour un re-render au changement de devise, le composant doit s’abonner au store,
 * ex. : `useCurrencyStore((s) => s.currentCurrency)`.
 */
export const formatCurrency = (amount: number): string => {
  const { currentCurrency, rates } = useCurrencyStore.getState();
  return formatMadMoney(amount, currentCurrency, rates);
};

// Fonction pour formater les pourcentages
export const formatPercentage = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

// Fonction pour formater les nombres
export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('fr-MA').format(value);
};

// Fonction pour obtenir la classe de couleur selon la valeur
export const getColorClass = (value: number, threshold: number = 0): string => {
  if (value > threshold) return 'text-green-600';
  if (value < threshold) return 'text-red-600';
  return 'text-gray-600';
};

// Fonction pour obtenir l'icône de tendance
export const getTrendIcon = (value: number): 'trending-up' | 'trending-down' | 'minus' => {
  if (value > 0) return 'trending-up';
  if (value < 0) return 'trending-down';
  return 'minus';
};

// Fonction pour calculer le pourcentage de progression
export const calculateProgress = (current: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
};

// Fonction pour formater les dates
export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
};

// Fonction pour formater les heures
export const formatTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

// Fonction pour obtenir le statut coloré
export const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'actif':
    case 'terminé':
    case 'livré':
    case 'approuvé':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'en cours':
    case 'en transit':
    case 'en attente':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'annulé':
    case 'refusé':
    case 'en retard':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'en douane':
    case 'en route':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

// Fonction pour tronquer le texte
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Fonction pour valider les données
export const validateData = (data: any): boolean => {
  return data !== null && data !== undefined && data !== '';
};

// Fonction pour obtenir la taille de widget adaptative
export const getAdaptiveSize = (size: 'small' | 'medium' | 'large', type: 'text' | 'spacing' | 'grid'): string => {
  switch (size) {
    case 'small':
      return type === 'text' ? 'text-sm' : type === 'spacing' ? 'p-2' : 'grid-cols-1';
    case 'large':
      return type === 'text' ? 'text-lg' : type === 'spacing' ? 'p-6' : 'grid-cols-3';
    default:
      return type === 'text' ? 'text-base' : type === 'spacing' ? 'p-4' : 'grid-cols-2';
  }
}; 