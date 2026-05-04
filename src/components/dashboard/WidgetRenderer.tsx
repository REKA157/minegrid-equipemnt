import React, { useState, useEffect } from 'react';
import { Widget } from '../../constants/dashboardTypes';
import { getWidgetData } from '../../constants/mockData';
import { supabaseClient } from '../../utils/supabaseClient';

// Import des widgets avancés avec IA
import SalesPerformanceScoreWidget from './widgets/SalesPerformanceScoreWidget';
import SalesPipelineWidget from './widgets/SalesPipelineWidget';
import SalesEvolutionWidgetEnriched from '../../components/SalesEvolutionWidgetEnriched';
import DailyActionsPriorityWidget from './widgets/DailyActionsPriorityWidget';

// Import des widgets IA
import AIInsightsWidget from './widgets/AIInsightsWidget';
import AIOptimizationWidget from './widgets/AIOptimizationWidget';

// Import des widgets basiques (fallback)
import MetricWidget from './widgets/MetricWidget';
import ChartWidget from './widgets/ChartWidget';
import ListWidget from './widgets/ListWidget';
import InventoryWidget from './widgets/InventoryWidget';
import PerformanceWidget from './widgets/PerformanceWidget';
import DailyActionsWidget from './widgets/DailyActionsWidget';
import StockStatusWidget from './widgets/StockStatusWidget';
import EquipmentAvailabilityWidget from './widgets/EquipmentAvailabilityWidget';
import UpcomingRentalsWidget from './widgets/UpcomingRentalsWidget';

// Import des widgets spécialisés pour vendeur
// Les composants React ont été supprimés du fichier VendeurWidgets.tsx
// car seuls les widgets de configuration sont maintenant utilisés

interface WidgetRendererProps {
  widget: Widget;
  widgetSize?: 'small' | 'medium' | 'large';
  onAction?: (action: string, data: any) => void;
}

// Déterminer la taille du texte en fonction de la taille du widget et du type d'élément
function getFontSizeFromWidgetSize(size: string, type: 'title' | 'value' = 'title') {
  if (type === 'value') {
    if (size === '1/3') return 'text-[clamp(1rem,2vw,1.2rem)]';
    if (size === '1/2') return 'text-[clamp(1.1rem,2.5vw,1.5rem)]';
    if (size === '2/3') return 'text-[clamp(1.3rem,3vw,2rem)]';
    if (size === '1/1') return 'text-[clamp(1.5rem,4vw,2.5rem)]';
  } else {
    if (size === '1/3') return 'text-sm md:text-base';
    if (size === '1/2') return 'text-base md:text-lg';
    if (size === '2/3') return 'text-lg md:text-xl';
    if (size === '1/1') return 'text-xl md:text-2xl';
  }
  return 'text-base';
}

// Classe CSS pour l'ellipsis (à ajouter dans le global CSS si besoin)
// .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

const WidgetRenderer: React.FC<WidgetRendererProps> = ({ 
  widget, 
  widgetSize = 'medium',
  onAction 
}) => {
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedUserIdLoading, setResolvedUserIdLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolveUser = async () => {
      try {
        const { data } = await supabaseClient.auth.getSession();
        const id = data.session?.user?.id ?? null;
        if (!cancelled) setResolvedUserId(id);
      } catch (err) {
        console.error('WidgetRenderer: failed to resolve user id', err);
        if (!cancelled) setResolvedUserId(null);
      } finally {
        if (!cancelled) setResolvedUserIdLoading(false);
      }
    };

    resolveUser();
    return () => {
      cancelled = true;
    };
  }, []);

  // Récupérer les données pour ce widget
  const rawData = getWidgetData(widget.id, widget.dataSource);

  // Déterminer la taille du texte à appliquer
  const fontSizeClass = getFontSizeFromWidgetSize(widget.size || widgetSize);

  const getSalesPipelineData = () => {
    if (Array.isArray(rawData)) {
      return rawData;
    }
    // Données par défaut complètes pour le pipeline commercial
    return [
      {
        id: '1',
        title: 'Excavatrice CAT 320',
        status: 'Qualifié',
        priority: 'high' as const,
        value: 850000,
        probability: 85,
        nextAction: 'Envoi devis détaillé',
        lastContact: '2024-01-20',
        assignedTo: 'Ahmed Benali',
        stage: 'Devis',
        company: 'Entreprise BTP Maroc',
        email: 'contact@btp-maroc.ma',
        phone: '+212 5 22 34 56 78'
      },
      {
        id: '2',
        title: 'Chargeuse JCB 3CX',
        status: 'En négociation',
        priority: 'high' as const,
        value: 420000,
        probability: 70,
        nextAction: 'Réunion technique',
        lastContact: '2024-01-19',
        assignedTo: 'Fatima Zahra',
        stage: 'Négociation',
        company: 'Construction Atlas',
        email: 'achat@atlas-construction.ma',
        phone: '+212 5 24 12 34 56'
      },
      {
        id: '3',
        title: 'Bulldozer Komatsu D65',
        status: 'Prospection',
        priority: 'medium' as const,
        value: 1200000,
        probability: 40,
        nextAction: 'Premier contact',
        lastContact: '2024-01-15',
        assignedTo: 'Karim Alami',
        stage: 'Prospection',
        company: 'Mines du Sud',
        email: 'direction@mines-sud.ma',
        phone: '+212 5 28 98 76 54'
      },
      {
        id: '4',
        title: 'Pelle mécanique Volvo EC220',
        status: 'Conclu',
        priority: 'low' as const,
        value: 680000,
        probability: 100,
        nextAction: 'Livraison prévue',
        lastContact: '2024-01-18',
        assignedTo: 'Ahmed Benali',
        stage: 'Conclu',
        company: 'Travaux Publics Plus',
        email: 'commande@tpp.ma',
        phone: '+212 5 26 45 67 89'
      },
      {
        id: '5',
        title: 'Camion benne Mercedes',
        status: 'Perdu',
        priority: 'low' as const,
        value: 280000,
        probability: 0,
        nextAction: 'Archiver le dossier',
        lastContact: '2024-01-10',
        assignedTo: 'Fatima Zahra',
        stage: 'Perdu',
        company: 'Transport Express',
        email: 'info@transport-express.ma',
        phone: '+212 5 22 11 22 33'
      },
      {
        id: '6',
        title: 'Groupe électrogène Perkins',
        status: 'Qualifié',
        priority: 'medium' as const,
        value: 180000,
        probability: 60,
        nextAction: 'Démonstration produit',
        lastContact: '2024-01-16',
        assignedTo: 'Karim Alami',
        stage: 'Devis',
        company: 'Énergie Solutions',
        email: 'technique@energie-solutions.ma',
        phone: '+212 5 25 67 89 01'
      },
      {
        id: '7',
        title: 'Compresseur d\'air Atlas Copco',
        status: 'En négociation',
        priority: 'high' as const,
        value: 320000,
        probability: 75,
        nextAction: 'Négociation prix',
        lastContact: '2024-01-17',
        assignedTo: 'Ahmed Benali',
        stage: 'Négociation',
        company: 'Industries Modernes',
        email: 'achats@industries-modernes.ma',
        phone: '+212 5 23 45 67 89'
      },
      {
        id: '8',
        title: 'Bétonnière mobile',
        status: 'Prospection',
        priority: 'medium' as const,
        value: 95000,
        probability: 30,
        nextAction: 'Présentation catalogue',
        lastContact: '2024-01-12',
        assignedTo: 'Fatima Zahra',
        stage: 'Prospection',
        company: 'Béton Pro',
        email: 'contact@beton-pro.ma',
        phone: '+212 5 27 89 01 23'
      }
    ];
  };

  const getSalesEvolutionData = () => {
    if (Array.isArray(rawData)) {
      return rawData;
    }
    // Données par défaut pour l'évolution des ventes
    return [];
  };

  const getRentalPipelineData = () => {
    if (Array.isArray(rawData)) {
      return rawData;
    }
    // Données par défaut pour le pipeline de location
    return [
      {
        id: '1',
        title: 'Location Excavatrice CAT 320',
        status: 'Demande reçue',
        priority: 'high' as const,
        value: 45000,
        probability: 90,
        nextAction: 'Vérification disponibilité',
        lastContact: '2024-01-20',
        assignedTo: 'Ahmed Benali',
        stage: 'Demande',
        company: 'BTP Maroc',
        email: 'contact@btp-maroc.ma',
        phone: '+212 5 22 34 56 78',
        duration: '5 jours',
        equipment: 'Excavatrice CAT 320'
      },
      {
        id: '2',
        title: 'Location Chargeur frontal',
        status: 'En négociation',
        priority: 'high' as const,
        value: 28000,
        probability: 75,
        nextAction: 'Finalisation contrat',
        lastContact: '2024-01-19',
        assignedTo: 'Fatima Zahra',
        stage: 'Négociation',
        company: 'Construction Plus',
        email: 'achat@construction-plus.ma',
        phone: '+212 5 24 12 34 56',
        duration: '7 jours',
        equipment: 'Chargeur frontal'
      },
      {
        id: '3',
        title: 'Location Bouteur D6',
        status: 'Prospection',
        priority: 'medium' as const,
        value: 35000,
        probability: 50,
        nextAction: 'Premier contact',
        lastContact: '2024-01-15',
        assignedTo: 'Karim Alami',
        stage: 'Prospection',
        company: 'Mines Atlas',
        email: 'direction@mines-atlas.ma',
        phone: '+212 5 28 98 76 54',
        duration: '10 jours',
        equipment: 'Bouteur D6'
      }
    ];
  };

  const getEquipmentData = () => {
    if (Array.isArray(rawData)) return rawData;
    return [
      { id: '1', name: 'CAT 320D - Pelle hydraulique', status: 'available', location: 'Casablanca', lastUpdate: '2026-03-13T10:30:00Z', nextMaintenance: '2026-04-05' },
      { id: '2', name: 'JCB 3CX - Chargeuse', status: 'rented', location: 'Rabat', lastUpdate: '2026-03-12T14:15:00Z', returnDate: '2026-03-25' },
      { id: '3', name: 'Komatsu PC200 - Pelle mécanique', status: 'maintenance', location: 'Casablanca', lastUpdate: '2026-03-11T16:45:00Z', nextMaintenance: '2026-03-18' },
      { id: '4', name: 'CAT 950GC - Chargeur sur pneus', status: 'available', location: 'Marrakech', lastUpdate: '2026-03-13T08:00:00Z', nextMaintenance: '2026-04-20' },
      { id: '5', name: 'JCB 4CX - Tractopelle', status: 'rented', location: 'Agadir', lastUpdate: '2026-03-10T13:30:00Z', returnDate: '2026-03-28' },
      { id: '6', name: 'Volvo EC220 - Pelle sur chenilles', status: 'available', location: 'Tanger', lastUpdate: '2026-03-13T09:00:00Z', nextMaintenance: '2026-05-01' },
      { id: '7', name: 'Liebherr LTM 1100 - Grue mobile', status: 'rented', location: 'Casablanca', lastUpdate: '2026-03-09T11:00:00Z', returnDate: '2026-03-20' },
      { id: '8', name: 'Bomag BW 213 - Compacteur', status: 'available', location: 'Fès', lastUpdate: '2026-03-12T07:30:00Z', nextMaintenance: '2026-04-15' },
    ];
  };

  // Fonction pour gérer les actions des widgets
  const handleWidgetAction = (action: string, actionData: any) => {
    if (onAction) {
      onAction(action, actionData);
    }
    
    // Logique spécifique selon le type d'action
    switch (action) {
      case 'contact':
        console.log('Action contact:', actionData);
        // Ici on pourrait ouvrir un modal de contact, etc.
        break;
      case 'complete':
        console.log('Action complete:', actionData);
        // Ici on pourrait marquer une tâche comme terminée
        break;
      case 'edit':
        console.log('Action edit:', actionData);
        // Ici on pourrait ouvrir un formulaire d'édition
        break;
      case 'delete':
        console.log('Action delete:', actionData);
        // Ici on pourrait supprimer un élément
        break;
      default:
        console.log('Action non reconnue:', action, actionData);
    }
  };

  // Rendre le widget approprié selon son type et ID
  switch (widget.type) {
    // Widgets IA - Priorité haute
    case 'ai-insights':
      if (resolvedUserIdLoading) {
        return (
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600" />
            <span className="ml-2 text-gray-600 text-sm">Chargement...</span>
          </div>
        );
      }
      if (!resolvedUserId) {
        return (
          <div className="p-4 text-sm text-gray-600">
            Connectez-vous pour afficher les insights IA.
          </div>
        );
      }
      return (
        <AIInsightsWidget 
          userId={resolvedUserId}
          widgetSize={widgetSize}
        />
      );

    case 'ai-optimization':
      if (resolvedUserIdLoading) {
        return (
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600" />
            <span className="ml-2 text-gray-600 text-sm">Chargement...</span>
          </div>
        );
      }
      if (!resolvedUserId) {
        return (
          <div className="p-4 text-sm text-gray-600">
            Connectez-vous pour afficher les recommandations IA.
          </div>
        );
      }
      return (
        <AIOptimizationWidget 
          userId={resolvedUserId}
          widgetSize={widgetSize}
        />
      );

    // Widgets avancés avec IA - Priorité haute
    case 'performance':
      if (widget.id === 'sales-performance-score') {
        return <SalesPerformanceScoreWidget />;
      }
      return (
        <PerformanceWidget 
          widget={widget} 
          widgetSize={widgetSize as any}
          onShowDetails={() => {}}
        />
      );

    case 'chart':
      if (widget.id === 'sales-evolution') {
        return <SalesEvolutionWidgetEnriched data={getSalesEvolutionData()} />;
      }
      return (
        <ChartWidget 
          widget={widget} 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
        />
      );

    case 'list':
      if (widget.id === 'sales-pipeline' || widget.id === 'leads-pipeline') {
        // Affiche le pipeline commercial (même composant ; données mock par id si absentes en base)
        return (
          <div className="flex-1 overflow-y-auto min-h-0 p-4" style={{ maxHeight: '100%' }}>
            <SalesPipelineWidget data={{ leads: getSalesPipelineData() }} />
          </div>
        );
      }
      if (widget.id === 'stock-status') {
        // Affiche le widget Plan d'action Stock & Revente
        return <StockStatusWidget />;
      }
      return (
        <ListWidget 
          widget={widget} 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
          onAction={handleWidgetAction}
        />
      );

    case 'pipeline':
      if (widget.id === 'stock-status') {
        return <StockStatusWidget />;
      }
      if (widget.id === 'sales-pipeline' || widget.id === 'leads-pipeline') {
        return (
          <div className="flex-1 overflow-y-auto min-h-0 p-4" style={{ maxHeight: '100%' }}>
            <SalesPipelineWidget data={{ leads: getSalesPipelineData() }} />
          </div>
        );
      }
      if (widget.id === 'rental-pipeline') {
        // Pipeline de location avec données spécifiques
        return (
          <div className="flex-1 overflow-y-auto min-h-0 p-4" style={{ maxHeight: '100%' }}>
            <SalesPipelineWidget data={{ leads: getRentalPipelineData() }} />
          </div>
        );
      }
      return (
        <ListWidget 
          widget={widget} 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
          onAction={handleWidgetAction}
        />
      );

    case 'daily-actions':
      return (
        <DailyActionsPriorityWidget 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
          onAction={handleWidgetAction}
        />
      );

    case 'metric':
      return (
        <MetricWidget 
          widget={widget} 
          data={rawData as any} 
          widgetSize={widgetSize as any}
        />
      );

    case 'inventory':
      return (
        <InventoryWidget 
          widget={widget} 
          widgetSize={widgetSize as any}
          onShowDetails={() => {}}
        />
      );

    case 'equipment':
      return (
        <EquipmentAvailabilityWidget
          data={Array.isArray(rawData) ? rawData as any : getEquipmentData()}
          widgetSize={widgetSize}
        />
      );

    case 'calendar':
      return (
        <UpcomingRentalsWidget
          data={Array.isArray(rawData) ? rawData as any : []}
          widgetSize={widgetSize}
          onAction={handleWidgetAction}
        />
      );

    case 'map':
      return (
        <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg border border-dashed border-gray-300 p-4">
          <div className="text-center">
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm font-medium text-gray-600">{widget.title}</p>
            <p className="text-xs text-gray-400 mt-1">Carte interactive — bientôt disponible</p>
          </div>
        </div>
      );

    default:
      return (
        <div className="text-center text-gray-500 py-4">
          <div className="text-sm">Type de widget non supporté: {widget.type}</div>
          <div className="text-xs">ID: {widget.id}</div>
        </div>
      );
  }
};

export default WidgetRenderer; 