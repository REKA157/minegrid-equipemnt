import { Widget } from '../types';
import React, { useEffect, useState } from 'react';
import {
  getDailyInterventions,
  getEquipmentAvailability,
  getInventoryStatus,
  getPreventiveMaintenance,
  getRentalRevenue,
  getRepairsStatus,
  getTechniciansWorkload,
  getUpcomingRentals,
} from '../../../utils/enterpriseApi';
import { getChartData } from './getChartData';
import { mockData } from './mockData';
import { iconMap } from './iconMap';
import {
  DollarSign,
  Eye,
  GripVertical,
  Layout,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import { MetricWidget } from './MetricWidget';
import { EquipmentAvailabilityWidget } from './EquipmentAvailabilityWidget';
import { SalesPipelineWidget } from './SalesPipelineWidget';
import { ListWidget } from './ListWidget';
import SalesEvolutionWidgetEnriched from '../../../components/SalesEvolutionWidgetEnriched';
import { ChartWidget } from './ChartWidget';
import { CalendarWidget } from './CalendarWidget';
import { getCalendarData } from './getCalendarData';
import { MapWidget } from './MapWidget';
import { getMapData } from './getMapData';
import { getEquipmentAvailabilityData } from './getEquipmentAvailabilityData';
import { PreventiveMaintenanceWidget } from './PreventiveMaintenanceWidget';
import { getMaintenanceData } from './getMaintenanceData';
import DashboardSalesPerformanceScoreWidget from '../../../components/dashboard/widgets/SalesPerformanceScoreWidget';
import { DailyActionsPriorityWidget } from '../../DailyActionsWidgetFixed';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const WidgetComponent = ({
  widget,
  onRemove,
  onToggleSize,
  onToggleVisibility,
  onShowDetails,
  onMarkRepairComplete,
  onAssignTechnician,
  onShowInterventionForm,
  onShowRentalForm,
  onUpdateRentalStatus,
  onShowRentalDetails,
  onEditRental,
  dataVersion,
  widgetSize = 'normal' // Nouveau prop pour la taille du widget
}: {
  widget: Widget;
  onRemove: (widgetId: string) => void;
  onToggleSize: (widgetId: string) => void;
  onToggleVisibility: (widgetId: string) => void;
  onShowDetails: (content: React.ReactNode) => void;
  onMarkRepairComplete: (repairId: string) => void;
  onAssignTechnician: (repairId: string, technicianId: string, technicianName: string) => void;
  onShowInterventionForm: () => void;
  onShowRentalForm: () => void;
  onUpdateRentalStatus: (rentalId: string, status: string) => void;
  onShowRentalDetails: (rental: any) => void;
  onEditRental: (rental: any) => void;
  dataVersion: number;
  widgetSize?: 'small' | 'normal' | 'large';
}) => {
  console.log('🔥 WidgetComponent rendu pour:', widget.id);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { madToDisplay, currentCurrency, formatCurrency: formatMadMoneyLabel } = useWidgetMadCurrency();

  // Fonctions de formatage adaptatives selon la taille du widget
  const getAdaptiveTextSize = (baseSize: string) => {
    switch (widgetSize) {
      case 'small':
        return baseSize.replace('text-', 'text-xs ');
      case 'large':
        return baseSize.replace('text-', 'text-lg ');
      default:
        return baseSize;
    }
  };

  const getAdaptivePadding = () => {
    switch (widgetSize) {
      case 'small':
        return 'p-2';
      case 'large':
        return 'p-4';
      default:
        return 'p-3';
    }
  };

  const getAdaptiveGridCols = (defaultCols: number) => {
    switch (widgetSize) {
      case 'small':
        return Math.max(1, defaultCols - 1);
      case 'large':
        return Math.min(6, defaultCols + 1);
      default:
        return defaultCols;
    }
  };

  const formatAdaptiveCurrency = (amountMad: number) => {
    const isSmall = widgetSize === 'small';
    const isLarge = widgetSize === 'large';
    const d = madToDisplay(amountMad);

    if (d >= 1000000) {
      return isSmall
        ? `${(d / 1000000).toFixed(1)}M`
        : isLarge
          ? `${(d / 1000000).toFixed(2)}M ${currentCurrency}`
          : `${(d / 1000000).toFixed(1)}M ${currentCurrency}`;
    }
    if (d >= 1000) {
      return isSmall
        ? `${(d / 1000).toFixed(0)}k`
        : isLarge
          ? `${(d / 1000).toFixed(1)}k ${currentCurrency}`
          : `${(d / 1000).toFixed(0)}k ${currentCurrency}`;
    }
    return isSmall
      ? `${Math.round(d)}`
      : isLarge
        ? formatMadMoneyLabel(amountMad)
        : d.toLocaleString('fr-FR');
  };

  const formatAdaptiveNumber = (num: number) => {
    const isSmall = widgetSize === 'small';
    const isLarge = widgetSize === 'large';
    
    if (num >= 1000000) {
      return isSmall ? `${(num / 1000000).toFixed(1)}M` :
             isLarge ? `${(num / 1000000).toFixed(2)}M` :
             `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return isSmall ? `${(num / 1000).toFixed(0)}k` :
             isLarge ? `${(num / 1000).toFixed(1)}k` :
             `${(num / 1000).toFixed(0)}k`;
    } else {
      return isSmall ? `${num}` :
             isLarge ? `${num.toLocaleString('fr-FR')}` :
             `${num.toLocaleString('fr-FR')}`;
    }
  };

  const getAdaptiveIconSize = () => {
    switch (widgetSize) {
      case 'small':
        return 'h-3 w-3';
      case 'large':
        return 'h-6 w-6';
      default:
        return 'h-4 w-4';
    }
  };

  // Fonction pour obtenir les classes CSS adaptatives
  const getAdaptiveClasses = () => {
    switch (widgetSize) {
      case 'small':
        return {
          text: {
            title: 'text-xs',
            subtitle: 'text-xs',
            value: 'text-lg',
            small: 'text-xs'
          },
          spacing: {
            padding: 'p-2',
            gap: 'gap-1',
            margin: 'm-1'
          },
          grid: {
            cols: 'grid-cols-1',
            gap: 'gap-1'
          }
        };
      case 'large':
        return {
          text: {
            title: 'text-lg',
            subtitle: 'text-base',
            value: 'text-3xl',
            small: 'text-sm'
          },
          spacing: {
            padding: 'p-4',
            gap: 'gap-3',
            margin: 'm-2'
          },
          grid: {
            cols: 'grid-cols-3',
            gap: 'gap-3'
          }
        };
      default:
        return {
          text: {
            title: 'text-sm',
            subtitle: 'text-xs',
            value: 'text-2xl',
            small: 'text-xs'
          },
          spacing: {
            padding: 'p-3',
            gap: 'gap-2',
            margin: 'm-1'
          },
          grid: {
            cols: 'grid-cols-2',
            gap: 'gap-2'
          }
        };
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let result: any;

        if (widget.type === 'performance') {
          setIsLoading(false);
          return;
        }

        if (
          widget.type === 'chart' &&
          (widget.id === 'sales-evolution' || widget.id === 'sales-chart')
        ) {
          setIsLoading(false);
          return;
        }

        switch (widget.dataSource) {
          case 'interventions-today':
            result = await getDailyInterventions();
            console.log('[DEBUG] Données reçues de getDailyInterventions():', JSON.stringify(result, null, 2));
            setData(result || []);
            break;
          case 'repair-status':
            result = await getRepairsStatus();
            setData(result);
            break;
          case 'parts-inventory':
            result = await getInventoryStatus();
            setData(result);
            break;
          case 'technician-workload':
            result = await getTechniciansWorkload();
            setData(result);
            break;
          case 'rental-revenue':
            result = await getRentalRevenue();
            setData(result);
            break;
          case 'equipment-availability':
            console.log('[DEBUG] Chargement du widget equipment-availability...');
            result = await getEquipmentAvailability();
            console.log('[DEBUG] Données reçues de getEquipmentAvailability():', JSON.stringify(result, null, 2));
            setData(result);
            break;
          case 'upcoming-rentals':
            result = await getUpcomingRentals();
            setData(result);
            break;
          case 'maintenance-schedule':
            result = await getPreventiveMaintenance();
            setData(result);
            break;
          default:
            result = (mockData as any)[widget.dataSource] || null;
            setData(result);
        }
      } catch (err: any) {
        setError(err.message);
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [widget.dataSource, dataVersion, widget.type, widget.id]);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${isExpanded ? 'col-span-2' : ''}`}>
      {/* Header du widget avec contrôles */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
        <div className="flex items-center flex-1">
          {/* Icône et titre */}
          <div className="flex items-center flex-1">
            {(() => {
              const IconComponent = typeof widget.icon === 'string' ? iconMap[widget.icon] : widget.icon;
              const Icon = IconComponent || DollarSign;
              return <Icon className="h-4 w-4 text-orange-600 mr-2" />;
            })()}
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{widget.title}</h3>
          </div>
        </div>

        {/* Contrôles du widget */}
        <div className="flex items-center space-x-1">
           <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title={isExpanded ? "Réduire" : "Agrandir"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={() => onToggleSize(widget.id)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Changer la taille"
          >
            <Layout className="h-4 w-4" />
          </button>

          <button
            onClick={() => onToggleVisibility(widget.id)}
            className={`p-1 ${isCollapsed ? 'text-gray-600' : 'text-gray-400'} hover:text-gray-600`}
            title={isCollapsed ? "Développer le widget" : "Réduire le widget"}
          >
            <Eye className="h-4 w-4" />
          </button>

          <button
            onClick={() => onRemove(widget.id)}
            className="p-1 text-gray-400 hover:text-red-600"
            title="Supprimer le widget"
          >
            <X className="h-4 w-4" />
          </button>
           <button
            className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing ml-2 handle"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contenu du widget */}
       <div className={`transition-all duration-200 flex-grow ${isCollapsed ? 'max-h-0 overflow-hidden' : ''}`}>
        <div className={`${getAdaptivePadding()} h-full`}>
        {(() => {
            if (widget.type === 'performance') {
              return <DashboardSalesPerformanceScoreWidget />;
            }
            if (
              widget.type === 'chart' &&
              (widget.id === 'sales-evolution' || widget.id === 'sales-chart')
            ) {
              return <SalesEvolutionWidgetEnriched />;
            }
            if (isLoading) {
              return (
                <div className="text-center text-gray-500 dark:text-gray-400 py-3">
                  <div className="text-sm">Chargement des données...</div>
                </div>
              );
            }

            if (error) {
              return (
                <div className="text-center text-red-600 dark:text-red-400 py-3">
                  <div className="text-sm">{error}</div>
                </div>
              );
            }

            if (!data) {
              return (
                <div className="text-center text-gray-500 dark:text-gray-400 py-3">
                  <div className="text-sm">Données non disponibles</div>
                </div>
              );
            }

            switch (widget.type) {
              case 'metric':
                return <MetricWidget 
                  widget={widget} 
                  data={data} 
                  widgetSize={widgetSize}
                />;
              case 'list':
                // Traitement spécial pour equipment-availability
                if (widget.id === 'equipment-availability') {
                  return <EquipmentAvailabilityWidget data={data} />;
                }
                // Traitement spécial pour leads-pipeline
                if (widget.id === 'leads-pipeline') {
                  return <SalesPipelineWidget data={data} />;
                }
                return <ListWidget
                  widget={widget}
                  data={data}
                  onShowDetails={onShowDetails}
                  onMarkRepairComplete={onMarkRepairComplete}
                  onAssignTechnician={onAssignTechnician}
                  onShowInterventionForm={onShowInterventionForm}
                />;
              case 'chart':
                console.log('[DEBUG] Rendu du widget chart enrichi pour:', widget.id);
                return <ChartWidget
                  widget={widget}
                  data={data}
                  onShowDetails={onShowDetails}
                  onShowInterventionForm={onShowInterventionForm}
                />;
              case 'calendar':
                return <CalendarWidget
                  widget={widget}
                  data={getCalendarData(widget.id)}
                  onShowRentalForm={() => {}}
                  onUpdateStatus={() => {}}
                  onShowRentalDetails={() => {}}
                  onEditRental={() => {}}
                />;
              case 'map':
                return <MapWidget widget={widget} data={getMapData(widget.id)} />;
              case 'equipment':
                console.log('[DEBUG] Rendu du widget equipment pour:', widget.id);
                return <EquipmentAvailabilityWidget data={getEquipmentAvailabilityData(widget.id)} />;
              case 'maintenance':
                console.log('[DEBUG] Rendu du widget maintenance pour:', widget.id);
                return <PreventiveMaintenanceWidget data={getMaintenanceData(widget.id)} />;
              case 'daily-actions':
                console.log('[DEBUG] Rendu du widget daily-actions pour:', widget.id);
                return <DailyActionsPriorityWidget data={data} widgetSize={widgetSize} />;
              default:
                return (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-3">
                    <div className="text-sm">Type de widget non supporté</div>
                  </div>
                );
            }
          })()}
        </div>
      </div>
    </div>
  );
};
