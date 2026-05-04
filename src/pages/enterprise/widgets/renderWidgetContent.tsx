import { getListData } from './getListData';
import { getChartData } from './getChartData';
import { SalesEvolutionWidgetEnriched } from './SalesEvolutionWidgetEnriched';
import DailyActionsPriorityWidget from '../../../components/dashboard/widgets/DailyActionsPriorityWidget';
import { getDailyActionsData } from './getDailyActionsData';
import { SalesPipelineWidget } from './SalesPipelineWidget';
import DashboardSalesPerformanceScoreWidget from '../../../components/dashboard/widgets/SalesPerformanceScoreWidget';
import { DailyActionsWidget } from './DailyActionsWidget';
import { NotificationsWidget } from './NotificationsWidget';
import { getNotificationsData } from './getNotificationsData';
import { AdvancedKPIsWidget } from './AdvancedKPIsWidget';
import { getAdvancedKPIsData } from './getAdvancedKPIsData';
import { PlanningWidget } from './PlanningWidget';
import { getPlanningData } from './getPlanningData';
import { MetricWidget } from './MetricWidget';
import { getMetricData } from './getMetricData';
import { ListWidget } from './ListWidget';
import { ChartWidget } from './ChartWidget';
import { CalendarWidget } from './CalendarWidget';
import { getCalendarData } from './getCalendarData';
import { MapWidget } from './MapWidget';
import { getMapData } from './getMapData';
import { EquipmentAvailabilityWidget } from './EquipmentAvailabilityWidget';
import { getEquipmentAvailabilityData } from './getEquipmentAvailabilityData';
import { PreventiveMaintenanceWidget } from './PreventiveMaintenanceWidget';
import { getMaintenanceData } from './getMaintenanceData';
import StockStatusWidget from '../../../components/dashboard/widgets/StockStatusWidget';
import React from 'react';

function dailyActionsWidgetSize(s: 'small' | 'normal' | 'large'): 'small' | 'medium' | 'large' {
  return s === 'normal' ? 'medium' : s;
}

export const renderWidgetContent = (widget: any, widgetSize: 'small' | 'normal' | 'large' = 'normal') => {
  console.log('[DEBUG] Appel widget ID:', widget.id);
  console.log('[DEBUG] renderWidgetContent appelée avec widget:', widget);
  console.log('[DEBUG] Type de widget:', widget.type);
  console.log('[DEBUG] Titre du widget:', widget.title);

  // Cas spécial pour le widget "Plan d'action stock & revente" (anciennement "État du stock")
  if (widget.id === 'stock-status' || widget.id === 'inventory-status' || widget.id === 'stock-action') {
    return <StockStatusWidget />;
  }

  // Cas spécial pour le widget "Évolution des ventes enrichie"
  if (widget.id === 'sales-evolution' || widget.id === 'sales-chart') {
    console.log('🎯 [DEBUG] Widget sales-evolution détecté! Rendu du composant enrichi');
    try {
      // Récupérer les données pour le widget d'évolution des ventes
      const salesData = getChartData(widget.id);
      console.log('📊 [DEBUG] Données récupérées pour sales-evolution:', salesData);
      return <SalesEvolutionWidgetEnriched data={salesData} />;
    } catch (err) {
      console.error('❌ [ERROR] Erreur rendering SalesEvolutionWidgetEnriched:', err);
      return <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-red-800 font-semibold">Erreur de rendu du widget enrichi</h3>
        <p className="text-red-600 text-sm">ID: {widget.id}</p>
        <p className="text-red-600 text-sm">Erreur: {err instanceof Error ? err.message : String(err)}</p>
      </div>;
    }
  }

  // Cas spécial pour le widget "Actions prioritaires du jour"
  if (widget.id === 'daily-actions') {
    console.log('[DEBUG] Widget daily-actions détecté, utilisation de getDailyActionsData');
    return <DailyActionsPriorityWidget data={getDailyActionsData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
  }

  // Cas spécial pour le widget "Pipeline commercial"
  if (widget.id === 'sales-pipeline' || widget.id === 'leads-pipeline') {
    return <SalesPipelineWidget data={getListData(widget.id)} />;
  }



  // Cas spécial pour le widget "Score de performance commerciale"
  if (widget.id === 'performance-score') {
    return <DashboardSalesPerformanceScoreWidget />;
  }

  // Cas spécial pour le widget "Assistant Prospection Active"
  if (widget.id === 'prospection-assistant') {
    return <SalesPipelineWidget data={getListData(widget.id)} />;
  }

  // Cas spécial pour le widget "Actions prioritaires du jour"
  if (widget.id === 'daily-priority-actions') {
    return <DailyActionsWidget data={getListData(widget.id)} />;
  }

  // Cas spécial pour le widget "Actions commerciales prioritaires"
  if (widget.id === 'daily-actions-priority' || widget.type === 'daily-actions') {
    return <DailyActionsPriorityWidget data={getListData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
  }

  // Cas spécial pour le widget "Notifications"
  if (widget.id === 'notifications') {
    return <NotificationsWidget data={getNotificationsData(widget.id)} />;
  }

  // Cas spécial pour les widgets KPIs avancés
  if (widget.id === 'operational-efficiency' || widget.id === 'financial-performance' || widget.id === 'customer-satisfaction') {
    return <AdvancedKPIsWidget data={getAdvancedKPIsData(widget.id)} />;
  }

  // Cas spécial pour les widgets de planification
  if (widget.id === 'weekly-schedule' || widget.id === 'monthly-overview') {
    return <PlanningWidget data={getPlanningData(widget.id)} />;
  }

  switch (widget.type) {
    case 'metric':
      return <MetricWidget widget={widget} data={getMetricData(widget.id)} />;
    case 'list':
      if (widget.id === 'leads-pipeline') {
        return <SalesPipelineWidget data={getListData(widget.id)} />;
      }
      return <ListWidget
        widget={widget}
        data={getListData(widget.id)}
        onShowDetails={() => {}}
        onMarkRepairComplete={() => {}}
        onAssignTechnician={() => {}}
        onShowInterventionForm={() => {}}
      />;
    case 'chart':
      // Cas spécial pour le widget "Évolution des ventes enrichie"
      if (widget.id === 'sales-evolution' || widget.id === 'sales-chart') {
        console.log('🎯 [DEBUG] Widget sales-evolution/sales-chart détecté! Rendu du composant enrichi');
        try {
          const chartData = getChartData(widget.id);
          console.log('📊 [DEBUG] Données pour le widget enrichi:', chartData);
          return <SalesEvolutionWidgetEnriched data={chartData} />;
        } catch (err) {
          console.error('❌ [ERROR] Erreur rendering SalesEvolutionWidgetEnriched:', err);
          return <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="text-red-800 font-semibold">Erreur de rendu du widget enrichi</h3>
            <p className="text-red-600 text-sm">ID: {widget.id}</p>
            <p className="text-red-600 text-sm">Erreur: {err instanceof Error ? err.message : String(err)}</p>
          </div>;
        }
      }
      // Pour les autres widgets de type chart
      return <ChartWidget
        widget={widget}
        data={getChartData(widget.id)}
        onShowDetails={() => {}}
        onShowInterventionForm={() => {}}
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
    case 'notifications':
      console.log('[DEBUG] Rendu du widget notifications pour:', widget.id);
      return <NotificationsWidget data={getNotificationsData(widget.id)} />;
    case 'performance':
      console.log('[DEBUG] Rendu du widget performance pour:', widget.id);
      return <DashboardSalesPerformanceScoreWidget />;
    case 'pipeline':
      console.log('[DEBUG] Rendu du widget pipeline pour:', widget.id);
      if (widget.id === 'sales-pipeline') {
        return <SalesPipelineWidget data={getListData(widget.id)} />;
      }
      return <div>Pipeline non reconnu: {widget.id}</div>;
    case 'priority':
      console.log('[DEBUG] Rendu du widget priority pour:', widget.id);
      if (widget.id === 'daily-actions') {
        return <DailyActionsPriorityWidget data={getDailyActionsData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
      }
      return <div>Widget priorité non reconnu: {widget.id}</div>;
    case 'daily-actions':
      console.log('[DEBUG] Rendu du widget daily-actions pour:', widget.id);
      return <DailyActionsPriorityWidget data={getDailyActionsData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
    case 'analytics':
      console.log('[DEBUG] Rendu du widget analytics pour:', widget.id);
      return <div>Widget analytics: {widget.title}</div>;
    default:
      console.log('[DEBUG] Type de widget non reconnu:', widget.type);
      return <div>Type de widget non reconnu: {widget.type}</div>;
  }
};
