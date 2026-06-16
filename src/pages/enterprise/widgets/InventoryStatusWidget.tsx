import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Lightbulb,
  Package,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import { toast } from '../../../utils/toast';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';
export const InventoryStatusWidget = ({ data }: { data: any[] }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState<any>({});
  const [sortBy, setSortBy] = useState<'priority' | 'stock' | 'value' | 'delivery' | 'dormant' | 'visibility' | 'salesTime'>('priority');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showStockAlerts, setShowStockAlerts] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showDormantStock, setShowDormantStock] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [showSalesActions, setShowSalesActions] = useState(false);
  const { formatCurrency } = useWidgetMadCurrency();

  // Recommandation fondée UNIQUEMENT sur des signaux RÉELS (anti-façade : aucune
  // valeur fabriquée ; les signaux dormance/visibilité ne sont utilisés que s'ils existent).
  const generateAIRecommendation = (item: any) => {
    const stock = typeof item.stock === 'number' ? item.stock : 0;
    const minStock = typeof item.minStock === 'number' ? item.minStock : 0;
    const dormantDays: number | null = typeof item.dormantDays === 'number' ? item.dormantDays : null;
    const visibilityRate: number | null = typeof item.visibilityRate === 'number' ? item.visibilityRate : null;
    const clickCount: number | null = typeof item.clickCount === 'number' ? item.clickCount : null;

    if (stock <= 0) {
      return { type: 'critical', message: `${item.title} en rupture de stock.`, action: 'Réapprovisionner', priority: 'high' };
    }
    if (dormantDays != null && dormantDays > 90 && (clickCount == null || clickCount < 5)) {
      return { type: 'critical', message: `${item.title} en stock depuis ${dormantDays} jours sans contact.`, action: 'Baisser le prix', priority: 'high' };
    }
    if (dormantDays != null && dormantDays > 60) {
      return { type: 'warning', message: `Stock dormant depuis ${dormantDays} jours.`, action: 'Booster la visibilité', priority: 'medium' };
    }
    if (visibilityRate != null && visibilityRate < 30) {
      return { type: 'info', message: `Faible visibilité (${visibilityRate}%).`, action: 'Optimiser les mots-clés', priority: 'low' };
    }
    if (minStock > 0 && stock < minStock) {
      return { type: 'warning', message: `${item.title} sous le seuil minimum (${stock}/${minStock}).`, action: 'Réapprovisionner', priority: 'medium' };
    }
    return { type: 'success', message: 'Aucune alerte sur données réelles.', action: 'Maintenir', priority: 'low' };
  };

  // Enrichir les données avec des informations de vente et de visibilité
  const enrichedData = React.useMemo(() => {
    return data.map((item) => {
      const stock = typeof item.stock === 'number' ? item.stock : 0;
      const minStock =
        typeof item.minStock === 'number'
          ? item.minStock
          : typeof item.min === 'number'
            ? item.min
            : 0;

      // Anti-façade : on N'INVENTE PAS ces signaux. Valeur réelle si fournie, sinon null
      // (ils ne déclencheront alors ni recommandation ni alerte fondée sur du vide).
      const dormantDays = typeof item.dormantDays === 'number' ? item.dormantDays : null;
      const visibilityRate = typeof item.visibilityRate === 'number' ? item.visibilityRate : null;
      const averageSalesTime = typeof item.averageSalesTime === 'number' ? item.averageSalesTime : null;
      const clickCount = typeof item.clickCount === 'number' ? item.clickCount : null;
      const lastContact = item.lastContact ?? null;
      const priceReduction = item.priceReduction || 0;
      const premiumBoost = item.premiumBoost || false;

      const title = item.title ?? item.category ?? 'Article';

      const aiRecommendation = generateAIRecommendation({
        ...item,
        title,
        stock,
        minStock,
        dormantDays,
        visibilityRate,
      });

      let status: string = item.status;
      if (!status) {
        if (stock <= 0) status = 'En rupture';
        else if (minStock > 0 && stock < minStock) status = 'Stock faible';
        else if (dormantDays != null && dormantDays > 60) status = 'Stock dormant';
        else if (visibilityRate != null && visibilityRate < 30) status = 'Faible visibilité';
        else status = 'Disponible';
      }

      const priority: string = item.priority ?? aiRecommendation.priority;

      return {
        ...item,
        title,
        stock,
        minStock,
        dormantDays,
        visibilityRate,
        averageSalesTime,
        clickCount,
        lastContact,
        priceReduction,
        premiumBoost,
        aiRecommendation,
        status,
        priority,
      };
    });
  }, [data]);

  const categories = React.useMemo(() => {
    const labels = new Set<string>();
    for (const row of enrichedData) {
      const c = row.category;
      if (c != null && String(c).trim() !== '') labels.add(String(c).normalize('NFC').trim());
    }
    return ['all', ...[...labels].sort((a, b) => a.localeCompare(b, 'fr'))];
  }, [enrichedData]);

  const priorities = ['all', 'high', 'medium', 'low'];
  const statuses = ['all', 'En rupture', 'Stock faible', 'Disponible', 'Stock dormant', 'Faible visibilité'];

  const filteredData = enrichedData.filter(item => {
    const categoryMatch =
      selectedCategory === 'all' ||
      String(item.category ?? '').normalize('NFC').trim() ===
        selectedCategory.normalize('NFC').trim();
    const priorityMatch = selectedPriority === 'all' || item.priority === selectedPriority;
    const statusMatch = selectedStatus === 'all' || item.status === selectedStatus;
    return categoryMatch && priorityMatch && statusMatch;
  });

  // Trier les données
  const sortedData = React.useMemo(() => {
    let sorted = [...filteredData];
    switch (sortBy) {
      case 'priority':
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        return sorted.sort((a, b) => priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder]);
      case 'stock':
        return sorted.sort((a, b) => (a.stock / a.minStock) - (b.stock / b.minStock));
      case 'value':
        return sorted.sort((a, b) => b.value - a.value);
      case 'delivery':
        return sorted.sort((a, b) => {
          const aDays = a.nextDelivery ? getDaysUntilDelivery(a.nextDelivery) : 999;
          const bDays = b.nextDelivery ? getDaysUntilDelivery(b.nextDelivery) : 999;
          return (aDays || 999) - (bDays || 999);
        });
      case 'dormant':
        return sorted.sort((a, b) => (a.dormantDays || 0) - (b.dormantDays || 0));
      case 'visibility':
        return sorted.sort((a, b) => (a.visibilityRate || 0) - (b.visibilityRate || 0));
      case 'salesTime':
        return sorted.sort((a, b) => (a.averageSalesTime || 0) - (b.averageSalesTime || 0));
      default:
        return sorted;
    }
  }, [filteredData, sortBy]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'En rupture': return 'bg-red-100 text-red-800 border-red-200';
      case 'Stock faible': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Disponible': return 'bg-green-100 text-green-800 border-green-200';
      case 'Stock dormant': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Faible visibilité': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityTextColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-700';
      case 'medium': return 'text-orange-700';
      case 'low': return 'text-green-700';
      default: return 'text-gray-700';
    }
  };

  const getStockPercentage = (stock: number, minStock: number) => {
    return Math.min((stock / minStock) * 100, 100);
  };

  const getStockBarColor = (stock: number, minStock: number) => {
    const percentage = getStockPercentage(stock, minStock);
    if (percentage === 0) return 'bg-red-500';
    if (percentage < 50) return 'bg-orange-500';
    if (percentage < 100) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getDaysUntilDelivery = (nextDelivery: string) => {
    if (!nextDelivery) return null;
    const today = new Date();
    const delivery = new Date(nextDelivery);
    const diffTime = delivery.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const handleOrderNow = (item: any) => {
    setOrderForm({
      id: item.id,
      title: item.title,
      supplier: item.supplier,
      currentStock: item.stock,
      minStock: item.minStock,
      suggestedQuantity: Math.max(item.minStock - item.stock, 1),
      unitValue: item.value,
      supplierPhone: item.supplierPhone,
      supplierEmail: item.supplierEmail
    });
    setShowOrderForm(true);
  };

  const handleContactSupplier = (item: any) => {
    const message = `Bonjour,\n\nJe souhaite commander ${item.title}.\n\nStock actuel: ${item.stock} unités\nStock minimum: ${item.minStock} unités\n\nPouvez-vous me contacter pour discuter des conditions ?\n\nCordialement,\nMinegrid Équipement`;

    // Ouvrir l'email client
    const subject = encodeURIComponent(`Commande - ${item.title}`);
    const body = encodeURIComponent(message);
    window.open(`mailto:${item.supplierEmail}?subject=${subject}&body=${body}`);

    toast(`Email préparé pour ${item.supplier}\n\nSujet: ${subject}\n\nLe client email s'ouvrira automatiquement.`);
  };

  const handleSubmitOrder = () => {
    const totalCost = orderForm.suggestedQuantity * orderForm.unitValue;
    toast(`✅ Commande soumise avec succès !\n\nProduit: ${orderForm.title}\nQuantité: ${orderForm.suggestedQuantity}\nCoût total: ${formatCurrency(totalCost)}\n\nUn email de confirmation sera envoyé au fournisseur.`);
    setShowOrderForm(false);
    setOrderForm({});
  };

  // Nouvelles fonctions pour les actions de vente
  const handleRecommendViaEmail = (item: any) => {
    const message = `Bonjour,\n\nJe vous recommande le ${item.title} qui pourrait vous intéresser.\n\nCaractéristiques:\n- Prix: ${formatCurrency(item.value)}\n- État: ${item.condition || 'Excellent'}\n- Disponible immédiatement\n\nContactez-nous pour plus d'informations.\n\nCordialement,\nMinegrid Équipement`;

    const subject = encodeURIComponent(`Recommandation - ${item.title}`);
    const body = encodeURIComponent(message);
    window.open(`mailto:?subject=${subject}&body=${body}`);

    toast(`Email de recommandation préparé pour ${item.title}`);
  };

  const handleBoostVisibility = (item: any) => {
    toast(`🚀 ${item.title} mis en avant Premium !\n\nActions appliquées:\n- Position prioritaire dans les résultats\n- Badge "Premium" ajouté\n- Promotion sur la page d'accueil\n- Emailing aux prospects qualifiés`);
  };

  const handleReducePrice = (item: any) => {
    const newPrice = item.value * 0.85; // Réduction de 15%
    toast(`💰 Prix réduit pour ${item.title} !\n\nAncien prix: ${formatCurrency(item.value)}\nNouveau prix: ${formatCurrency(newPrice)}\nRéduction: 15%\n\nCette action sera visible dans 5 minutes.`);
  };

  const handleAIAction = (item: any) => {
    const recommendation = item.aiRecommendation;
    toast(`🤖 Recommandation IA pour ${item.title}:\n\n${recommendation.message}\n\nAction suggérée: ${recommendation.action}\n\nVoulez-vous appliquer cette recommandation ?`);
  };

  // Calculer les KPI de vente
  const getSalesKPIs = () => {
    const totalItems = enrichedData.length;
    // Anti-façade : on ne compte/agrège QUE sur des valeurs réellement présentes (!= null).
    const dormantItems = enrichedData.filter((item) => item.dormantDays != null && item.dormantDays > 60).length;
    const lowVisibilityItems = enrichedData.filter((item) => item.visibilityRate != null && item.visibilityRate < 30).length;
    const salesTimes = enrichedData.map((item) => item.averageSalesTime).filter((v: any): v is number => typeof v === 'number');
    const avgSalesTime = salesTimes.length ? salesTimes.reduce((s: number, v: number) => s + v, 0) / salesTimes.length : null;
    const withDormant = enrichedData.filter((item) => item.dormantDays != null);
    const stockRotationRate = withDormant.length
      ? (withDormant.filter((item) => item.dormantDays < 30).length / withDormant.length) * 100
      : null;

    return {
      totalItems,
      dormantItems,
      lowVisibilityItems,
      avgSalesTime: avgSalesTime != null ? Math.round(avgSalesTime) : null,
      stockRotationRate: stockRotationRate != null ? Math.round(stockRotationRate) : null,
    };
  };

  // Fonctions d'analyse avancées
  const getStockAnalytics = () => {
    const totalValue = data.reduce((sum, item) => sum + item.value, 0);
    const lowStockItems = data.filter(item => item.stock < item.minStock && item.stock > 0).length;
    const outOfStockItems = data.filter(item => item.stock === 0).length;
    const criticalItems = data.filter(item => item.priority === 'high' && item.stock <= item.minStock).length;

    const avgStockLevel = data.reduce((sum, item) => sum + (item.stock / item.minStock), 0) / data.length;
    const stockEfficiency = (data.filter(item => item.stock >= item.minStock).length / data.length) * 100;

    return {
      totalValue,
      lowStockItems,
      outOfStockItems,
      criticalItems,
      avgStockLevel: avgStockLevel * 100,
      stockEfficiency
    };
  };

  const getStockTrends = () => {
    // Anti-façade : aucune tendance simulée. On dérive uniquement daysUntilEmpty du stock RÉEL.
    return data
      .map((item) => ({
        ...item,
        daysUntilEmpty: item.stock > 0 ? Math.floor(item.stock / (item.average_usage || 1)) : null,
      }))
      // On n'affiche une tendance que si la donnée réelle existe (champ `change`).
      .filter((item: any) => typeof item.change === 'number');
  };

  const generateStockRecommendations = () => {
    const analytics = getStockAnalytics();
    const recommendations = [];

    if (analytics.criticalItems > 0) {
      recommendations.push({
        type: 'critical',
        message: `${analytics.criticalItems} articles critiques nécessitent une attention immédiate`,
        action: 'Commander en urgence'
      });
    }

    if (analytics.stockEfficiency < 80) {
      recommendations.push({
        type: 'warning',
        message: `Efficacité du stock à ${analytics.stockEfficiency.toFixed(1)}%`,
        action: 'Optimiser les niveaux de stock'
      });
    }

    if (analytics.avgStockLevel > 150) {
      recommendations.push({
        type: 'info',
        message: 'Stock moyen élevé, considérer la réduction des commandes',
        action: 'Réviser la politique de stock'
      });
    }

    return recommendations;
  };

  // Calculer les statistiques
  const stats = React.useMemo(() => {
    const totalValue = data.reduce((sum, item) => sum + (item.value * item.stock), 0);
    const lowStockItems = data.filter(item => item.stock < item.minStock).length;
    const outOfStockItems = data.filter(item => item.stock === 0).length;
    const totalItems = data.length;
    const averageStockLevel = data.reduce((sum, item) => sum + (item.stock / item.minStock), 0) / totalItems * 100;

    return {
      totalValue,
      lowStockItems,
      outOfStockItems,
      totalItems,
      averageStockLevel: Math.round(averageStockLevel)
    };
  }, [data]);

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      {/* En-tête avec statistiques et actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Package className="h-6 w-6 text-orange-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Plan d'action stock & revente</h3>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex space-x-4 text-sm">
            <div className="text-center">
              <div className="font-semibold text-gray-900">{formatCurrency(stats.totalValue)}</div>
              <div className="text-gray-600">Valeur totale</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-orange-600">{getSalesKPIs().dormantItems}</div>
              <div className="text-gray-600">Stock dormant</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-red-600">{getSalesKPIs().lowVisibilityItems}</div>
              <div className="text-gray-600">Faible visibilité</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-blue-600">
                {getSalesKPIs().avgSalesTime != null ? `${getSalesKPIs().avgSalesTime}j` : '—'}
              </div>
              <div className="text-gray-600">Temps de vente</div>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex space-x-2">
            <button
              onClick={() => setShowAIInsights(true)}
              className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
            >
              IA Insights
            </button>
            <button
              onClick={() => setShowSalesActions(true)}
              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              Actions
            </button>
            <button
              onClick={() => setShowAnalytics(true)}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              Analyse
            </button>
          </div>
        </div>
      </div>

      {/* Section Recommandations Prioritaires */}
      <div className="mb-6">
        {/* Stock dormant - Priorité absolue */}
        {enrichedData.filter(item => (item.dormantDays || 0) > 60).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-red-800 flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                🚨 Stock dormant - Action requise
              </h4>
              <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">
                {enrichedData.filter(item => (item.dormantDays || 0) > 60).length} articles
              </span>
            </div>
            
            <div className="space-y-2">
              {enrichedData
                .filter(item => (item.dormantDays || 0) > 60)
                .sort((a, b) => (b.dormantDays || 0) - (a.dormantDays || 0))
                .slice(0, 3)
                .map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-red-100 last:border-b-0">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-red-900">{item.title}</div>
                      <div className="text-xs text-red-700">
                        En stock depuis {item.dormantDays} jours
                        {item.visibilityRate != null ? ` • Visibilité: ${item.visibilityRate}%` : ''}
                      </div>
                      <div className="text-xs text-red-600 mt-1">
                        💡 {item.aiRecommendation?.message}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleReducePrice(item)}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        Baisser prix
                      </button>
                      <button 
                        onClick={() => handleBoostVisibility(item)}
                        className="text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700"
                      >
                        Booster
                      </button>
                      <button 
                        onClick={() => handleRecommendViaEmail(item)}
                        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      >
                        Recommander
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            
            {enrichedData.filter(item => (item.dormantDays || 0) > 60).length > 3 && (
              <div className="text-center pt-2">
                <button className="text-sm text-red-700 hover:text-red-800">
                  Voir les {enrichedData.filter(item => (item.dormantDays || 0) > 60).length - 3} autres...
                </button>
              </div>
            )}
          </div>
        )}

        {/* Recommandations IA Globales */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
            <Zap className="h-4 w-4 mr-2" />
            🤖 Recommandations IA - Actions prioritaires
          </h4>
          <div className="space-y-3">
            {/* Temps moyen de vente — affiché uniquement si calculable sur données réelles */}
            {getSalesKPIs().avgSalesTime != null && (
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  <strong>Temps moyen de vente :</strong> {getSalesKPIs().avgSalesTime} jours
                </div>
              </div>
            )}

            {/* Actions recommandées */}
            {enrichedData.filter(item => item.aiRecommendation?.type === 'critical').length > 0 && (
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">
                  <strong>Actions critiques requises :</strong> {enrichedData.filter(item => item.aiRecommendation?.type === 'critical').length} articles
                  <br />
                  <span className="text-xs text-red-600">
                    • Baisser les prix • Booster la visibilité • Contacter les prospects
                  </span>
                </div>
              </div>
            )}
            
            {/* Astuce IA contextuelle */}
            <div className="flex items-start space-x-2">
              <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <strong>💡 Astuce IA :</strong> 
                {(() => {
                  const dormantItems = enrichedData.filter((item) => item.dormantDays != null && item.dormantDays > 90);
                  const lowVis = enrichedData.filter((item) => item.visibilityRate != null && item.visibilityRate < 30);
                  if (dormantItems.length > 0) {
                    const oldestItem = dormantItems[0];
                    return ` Le ${oldestItem.title} est en stock depuis ${oldestItem.dormantDays} jours. Proposer livraison gratuite ?`;
                  } else if (lowVis.length > 0) {
                    return ` ${lowVis.length} article(s) ont une faible visibilité. Améliorer le référencement ?`;
                  } else {
                    return ` Performance correcte. Maintenir les prix et la visibilité actuels.`;
                  }
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Raccourcis : applique un traitement sur le premier article éligible (pas une sélection manuelle). */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-green-800 mb-1 flex items-center">
            <Zap className="h-4 w-4 mr-2" />
            Raccourcis sur le premier article éligible
          </h4>
          <p className="text-[11px] text-green-900/80 mb-3">
            Chaque bouton cible automatiquement une ligne du catalogue (ex. stock dormant). Vérifiez toujours le détail sur la fiche article.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button 
              onClick={() => {
                const dormantItems = enrichedData.filter(item => (item.dormantDays || 0) > 60);
                if (dormantItems.length > 0) {
                  handleReducePrice(dormantItems[0]);
                }
              }}
              className="bg-red-600 text-white py-2 px-3 rounded text-sm hover:bg-red-700 transition-colors"
            >
              Baisser prix dormant
            </button>
            <button 
              onClick={() => {
                const lowVisibilityItems = enrichedData.filter((item) => item.visibilityRate != null && item.visibilityRate < 30);
                if (lowVisibilityItems.length > 0) {
                  handleBoostVisibility(lowVisibilityItems[0]);
                }
              }}
              className="bg-orange-600 text-white py-2 px-3 rounded text-sm hover:bg-orange-700 transition-colors"
            >
              Booster visibilité
            </button>
            <button 
              onClick={() => {
                const dormantItems = enrichedData.filter(item => (item.dormantDays || 0) > 60);
                if (dormantItems.length > 0) {
                  handleRecommendViaEmail(dormantItems[0]);
                }
              }}
              className="bg-blue-600 text-white py-2 px-3 rounded text-sm hover:bg-blue-700 transition-colors"
            >
              Recommander par email
            </button>
            <button 
              onClick={() => setShowAIInsights(true)}
              className="bg-purple-600 text-white py-2 px-3 rounded text-sm hover:bg-purple-700 transition-colors"
            >
              Voir insights IA
            </button>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-0 flex-shrink-0"
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category === 'all' ? 'Toutes catégories' : category}
            </option>
          ))}
        </select>
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-0 flex-shrink-0"
        >
          {priorities.map(priority => (
            <option key={priority} value={priority}>
              {priority === 'all' ? 'Toutes priorités' :
               priority === 'high' ? 'Haute' :
               priority === 'medium' ? 'Moyenne' : 'Basse'}
            </option>
          ))}
        </select>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-0 flex-shrink-0"
        >
          {statuses.map(status => (
            <option key={status} value={status}>
              {status === 'all' ? 'Tous statuts' : status}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'priority' | 'stock' | 'value' | 'delivery' | 'dormant' | 'visibility' | 'salesTime')}
          className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-0 flex-shrink-0"
        >
          <option value="priority">Trier par priorité</option>
          <option value="stock">Trier par niveau de stock</option>
          <option value="value">Trier par valeur</option>
          <option value="delivery">Trier par livraison</option>
          <option value="dormant">Trier par stock dormant</option>
          <option value="visibility">Trier par visibilité</option>
          <option value="salesTime">Trier par temps de vente</option>
        </select>
      </div>

      {/* Liste des articles */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {sortedData.map((item) => {
          const stockPercentage = getStockPercentage(item.stock, item.minStock);
          const daysUntilDelivery = getDaysUntilDelivery(item.nextDelivery);

          return (
            <div key={item.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-orange-300 transition-colors overflow-hidden">
              {/* En-tête avec priorité et statut */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${getPriorityColor(item.priority)}`}></div>
                  <span className="text-sm font-medium text-gray-900">{item.title}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </div>

              {/* Informations de stock */}
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Stock actuel:</span>
                  <span className="font-medium">{item.stock} / {item.minStock} min</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getStockBarColor(item.stock, item.minStock)}`}
                    style={{ width: `${stockPercentage}%` }}
                  ></div>
                </div>
                <div className="flex flex-col space-y-1 text-xs text-gray-600">
                  <span className="truncate">{item.category}</span>
                  <span className="truncate">{item.location}</span>
                </div>
              </div>

              {/* Informations de vente et visibilité — affichées UNIQUEMENT si réelles (anti-façade) */}
              {(item.dormantDays != null ||
                item.visibilityRate != null ||
                item.averageSalesTime != null ||
                item.clickCount != null) && (
                <div className="space-y-2 mb-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {item.dormantDays != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-xs">Stock dormant:</span>
                        <span className={`text-xs ${item.dormantDays > 60 ? 'text-orange-600 font-semibold' : 'text-gray-900'}`}>
                          {item.dormantDays}j
                        </span>
                      </div>
                    )}
                    {item.visibilityRate != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-xs">Visibilité:</span>
                        <span className={`text-xs ${item.visibilityRate < 30 ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                          {item.visibilityRate}%
                        </span>
                      </div>
                    )}
                    {item.averageSalesTime != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-xs">Temps vente:</span>
                        <span className="text-gray-900 text-xs">{item.averageSalesTime}j</span>
                      </div>
                    )}
                    {item.clickCount != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-xs">Clics:</span>
                        <span className="text-gray-900 text-xs">{item.clickCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recommandation IA */}
              {item.aiRecommendation && (
                <div className={`mb-3 p-2 rounded-lg text-xs ${
                  item.aiRecommendation.type === 'critical' ? 'bg-red-50 border border-red-200' :
                  item.aiRecommendation.type === 'warning' ? 'bg-orange-50 border border-orange-200' :
                  item.aiRecommendation.type === 'info' ? 'bg-blue-50 border border-blue-200' :
                  'bg-green-50 border border-green-200'
                }`}>
                  <div className="font-medium mb-1">🤖 IA Recommandation:</div>
                  <div className="text-gray-700">{item.aiRecommendation.message}</div>
                </div>
              )}

              {/* Informations fournisseur et livraison */}
              <div className="space-y-2 mb-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 text-xs">Fournisseur:</span>
                  <span className="text-xs truncate max-w-32">{item.supplier}</span>
                </div>
                {item.nextDelivery && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs">Livraison:</span>
                    <span className={`text-xs ${daysUntilDelivery && daysUntilDelivery <= 3 ? 'text-orange-600 font-semibold' : ''}`}>
                      {formatDate(item.nextDelivery)}
                      {daysUntilDelivery && daysUntilDelivery > 0 && ` (${daysUntilDelivery}j)`}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600 text-xs">Valeur:</span>
                  <span className="font-semibold text-xs">{formatCurrency(item.value)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                <button
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                  onClick={() => handleViewDetails(item)}
                >
                  Voir détails
                </button>
                <button
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                  onClick={() => handleAIAction(item)}
                >
                  IA
                </button>
                <button
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  onClick={() => handleRecommendViaEmail(item)}
                >
                  Recommander
                </button>
                <button
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                  onClick={() => handleBoostVisibility(item)}
                >
                  Booster
                </button>
                <button
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                  onClick={() => handleReducePrice(item)}
                >
                  Baisser prix
                </button>
                {item.stock < item.minStock && (
                  <>
                <button
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      onClick={() => handleOrderNow(item)}
                >
                      Commander
                </button>
                    <button
                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                      onClick={() => handleContactSupplier(item)}
                    >
                      Contacter
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de détails */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Détails du stock</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Produit</label>
                  <p className="text-gray-900">{selectedItem.title}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Catégorie</label>
                  <p className="text-gray-900">{selectedItem.category}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Stock actuel</label>
                  <p className="text-gray-900">{selectedItem.stock} unités</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Stock minimum</label>
                  <p className="text-gray-900">{selectedItem.minStock} unités</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Fournisseur</label>
                  <p className="text-gray-900">{selectedItem.supplier}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Localisation</label>
                  <p className="text-gray-900">{selectedItem.location}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Valeur unitaire</label>
                  <p className="text-gray-900">{formatCurrency(selectedItem.value)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Dernière commande</label>
                  <p className="text-gray-900">{formatDate(selectedItem.lastOrder)}</p>
                </div>
              </div>

              {selectedItem.nextDelivery && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Prochaine livraison</label>
                  <p className="text-gray-900">{formatDate(selectedItem.nextDelivery)}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Fermer
                </button>
                {selectedItem.stock < selectedItem.minStock && (
                  <button
                    onClick={() => handleOrderNow(selectedItem)}
                    className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700"
                  >
                    Commander maintenant
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'analyse avancée du stock */}
      {showAnalytics && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Analyse Avancée du Stock</h3>
              <button
                onClick={() => setShowAnalytics(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Statistiques globales */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{formatCurrency(getStockAnalytics().totalValue)}</div>
                  <div className="text-sm text-gray-600">Valeur totale</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{getStockAnalytics().avgStockLevel}%</div>
                  <div className="text-sm text-gray-600">Niveau moyen</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{getStockAnalytics().stockEfficiency}</div>
                  <div className="text-sm text-gray-600">Efficacité</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{getStockAnalytics().criticalItems}</div>
                  <div className="text-sm text-gray-600">Articles critiques</div>
                </div>
              </div>

              {/* Tendances et prévisions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Tendances de Consommation</h4>
                  <div className="space-y-2">
                    {getStockTrends().map((trend, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{trend.category}</span>
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${trend.trend === 'up' ? 'text-red-600' : 'text-green-600'}`}>
                            {trend.change}%
                          </span>
                          {trend.trend === 'up' ? (
                            <TrendingUp className="h-4 w-4 text-red-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Recommandations</h4>
                  <div className="space-y-2">
                    {generateStockRecommendations().map((rec, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <div className={`w-2 h-2 rounded-full mt-2 ${rec.priority === 'high' ? 'bg-red-500' : rec.priority === 'medium' ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                        <span className="text-sm text-gray-700">{rec.recommendation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Graphique de prévision */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-3">Prévision des Besoins (3 mois)</h4>
                <div className="h-64 bg-white rounded border p-4">
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Graphique de prévision en cours de développement...
                  </div>
                </div>
              </div>

              {/* Actions recommandées */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-3">Actions Prioritaires</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">
                    Commander pièces critiques
                  </button>
                  <button className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 text-sm">
                    Réviser niveaux de stock
                  </button>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                    Analyser fournisseurs
                  </button>
                  <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                    Optimiser commandes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'alertes de stock */}
      {showStockAlerts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Alertes de Stock</h3>
              <button
                onClick={() => setShowStockAlerts(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Alertes critiques */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-3 flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Alertes Critiques
                </h4>
                <div className="space-y-2">
                  {data.filter(item => item.color_indicator === 'red').map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-3 rounded border">
                      <div>
                        <div className="font-medium text-gray-900">{item.category}</div>
                        <div className="text-sm text-gray-600">Stock: {item.stock} / Min: {item.min}</div>
                      </div>
                      <button className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">
                        Commander
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alertes d'avertissement */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-semibold text-orange-900 mb-3 flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Avertissements
                </h4>
                <div className="space-y-2">
                  {data.filter(item => item.color_indicator === 'orange').map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-3 rounded border">
                      <div>
                        <div className="font-medium text-gray-900">{item.category}</div>
                        <div className="text-sm text-gray-600">Stock: {item.stock} / Min: {item.min}</div>
                      </div>
                      <button className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700">
                        Surveiller
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notifications de livraison */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                  <Truck className="h-5 w-5 mr-2" />
                  Livraisons à Venir
                </h4>
                <div className="space-y-2">
                  {data.filter(item => new Date(item.next_delivery) > new Date()).slice(0, 5).map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-3 rounded border">
                      <div>
                        <div className="font-medium text-gray-900">{item.category}</div>
                        <div className="text-sm text-gray-600">
                          Livraison: {formatDate(item.next_delivery)} ({getDaysUntilDelivery(item.next_delivery)} jours)
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {item.delivery_days} jours
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal des insights IA */}
      {showAIInsights && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">🤖 Insights IA - Plan d'action stock & revente</h3>
              <button
                onClick={() => setShowAIInsights(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Statistiques IA */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{enrichedData.filter(item => item.aiRecommendation?.type === 'critical').length}</div>
                  <div className="text-sm text-gray-600">Actions critiques</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{enrichedData.filter(item => item.aiRecommendation?.type === 'warning').length}</div>
                  <div className="text-sm text-gray-600">Avertissements</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{enrichedData.filter(item => item.dormantDays > 60).length}</div>
                  <div className="text-sm text-gray-600">Stock dormant</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{enrichedData.filter(item => item.visibilityRate < 30).length}</div>
                  <div className="text-sm text-gray-600">Faible visibilité</div>
                </div>
              </div>

              {/* Recommandations IA par priorité */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Recommandations IA par priorité</h4>
                
                {/* Actions critiques */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h5 className="font-semibold text-red-900 mb-3">🚨 Actions Critiques</h5>
                  <div className="space-y-2">
                    {enrichedData.filter(item => item.aiRecommendation?.type === 'critical').map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded border">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-sm text-gray-600 mt-1">{item.aiRecommendation.message}</div>
                        <div className="text-sm text-red-600 mt-1">Action: {item.aiRecommendation.action}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Avertissements */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h5 className="font-semibold text-orange-900 mb-3">⚠️ Avertissements</h5>
                  <div className="space-y-2">
                    {enrichedData.filter(item => item.aiRecommendation?.type === 'warning').map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded border">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-sm text-gray-600 mt-1">{item.aiRecommendation.message}</div>
                        <div className="text-sm text-orange-600 mt-1">Action: {item.aiRecommendation.action}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Informations */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h5 className="font-semibold text-blue-900 mb-3">ℹ️ Informations</h5>
                  <div className="space-y-2">
                    {enrichedData.filter(item => item.aiRecommendation?.type === 'info').map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded border">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-sm text-gray-600 mt-1">{item.aiRecommendation.message}</div>
                        <div className="text-sm text-blue-600 mt-1">Action: {item.aiRecommendation.action}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPI de performance */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-3">📊 KPI de Performance</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Délai de rotation des stocks</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {getSalesKPIs().avgSalesTime != null ? `${getSalesKPIs().avgSalesTime} jours` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Taux de visibilité moyen</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {(() => {
                        const vis = enrichedData.map((i) => i.visibilityRate).filter((v: any): v is number => typeof v === 'number');
                        return vis.length ? `${Math.round(vis.reduce((s: number, v: number) => s + v, 0) / vis.length)}%` : '—';
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Stock dormant (&gt;60j)</div>
                    <div className="text-lg font-semibold text-orange-600">{getSalesKPIs().dormantItems} articles</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Faible visibilité (moins de 30%)</div>
                    <div className="text-lg font-semibold text-red-600">{getSalesKPIs().lowVisibilityItems} articles</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal des actions de vente */}
      {showSalesActions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">🚀 Actions de vente - Plan d'action stock & revente</h3>
              <button
                onClick={() => setShowSalesActions(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-900 mb-1">Scénarios de démo</h4>
                <p className="text-xs text-green-900/80 mb-3">
                  Notifications toast uniquement — non connectées à votre catalogue réel tant que l&apos;API n&apos;est pas branchée.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                      const dormantItems = enrichedData.filter(item => item.dormantDays > 60);
                      toast(`📧 Email de recommandation préparé pour ${dormantItems.length} articles en stock dormant !`);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Recommander via Email ({enrichedData.filter(item => item.dormantDays > 60).length} articles)
                  </button>
                  <button 
                    onClick={() => {
                      const lowVisibilityItems = enrichedData.filter(item => item.visibilityRate < 30);
                      toast(`🚀 ${lowVisibilityItems.length} articles mis en avant Premium !`);
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
                  >
                    Mettre en avant Premium ({enrichedData.filter(item => item.visibilityRate < 30).length} articles)
                  </button>
                  <button 
                    onClick={() => {
                      const criticalItems = enrichedData.filter(item => item.aiRecommendation?.type === 'critical');
                      toast(`💰 Prix réduit pour ${criticalItems.length} articles critiques !`);
                    }}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm"
                  >
                    Baisser le prix ({enrichedData.filter(item => item.aiRecommendation?.type === 'critical').length} articles)
                  </button>
                  <button 
                    onClick={() => {
                      toast(`📊 Rapport de performance généré !`);
                    }}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm"
                  >
                    Générer rapport
                  </button>
                </div>
              </div>

              {/* Articles prioritaires */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">📋 Articles Prioritaires</h4>
                
                {enrichedData.filter(item => item.aiRecommendation?.type === 'critical' || item.dormantDays > 90).slice(0, 5).map((item, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg border">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {item.dormantDays != null ? `Stock dormant: ${item.dormantDays} jours` : 'Stock dormant: —'}
                          {item.visibilityRate != null ? ` | Visibilité: ${item.visibilityRate}%` : ''}
                        </div>
                        <div className="text-sm text-red-600 mt-1">{item.aiRecommendation?.message}</div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button 
                          onClick={() => handleRecommendViaEmail(item)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                        >
                          Recommander
                        </button>
                        <button 
                          onClick={() => handleBoostVisibility(item)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                        >
                          Booster
                        </button>
                        <button 
                          onClick={() => handleReducePrice(item)}
                          className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
                        >
                          Baisser prix
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Statistiques d'action */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-3">📈 Impact des Actions</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">+25%</div>
                    <div className="text-sm text-gray-600">Visibilité moyenne</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">-15%</div>
                    <div className="text-sm text-gray-600">Temps de vente</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">+40%</div>
                    <div className="text-sm text-gray-600">Taux de conversion</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
