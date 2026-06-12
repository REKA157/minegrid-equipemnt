import { getListData } from './getListData';
import { getChartData } from './getChartData';
import SalesEvolutionWidgetEnriched from '../../../components/SalesEvolutionWidgetEnriched';
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
import SharedSalesPipelineWidget from '../../../components/dashboard/widgets/SalesPipelineWidget';
import React from 'react';

function dailyActionsWidgetSize(s: 'small' | 'normal' | 'large'): 'small' | 'medium' | 'large' {
  return s === 'normal' ? 'medium' : s;
}

export const renderWidgetContent = (widget: any, widgetSize: 'small' | 'normal' | 'large' = 'normal') => {

  // Cas spécial pour le widget "Plan d'action stock & revente" (anciennement "État du stock")
  if (widget.id === 'stock-status' || widget.id === 'inventory-status' || widget.id === 'stock-action') {
    return <StockStatusWidget />;
  }

  if (widget.id === 'sales-evolution' || widget.id === 'sales-chart') {
    return <SalesEvolutionWidgetEnriched />;
  }

  if (widget.id === 'daily-actions') {
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
      // Évolution des ventes : données prod dans le composant
      if (widget.id === 'sales-evolution' || widget.id === 'sales-chart') {
        return <SalesEvolutionWidgetEnriched />;
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
      return <EquipmentAvailabilityWidget data={getEquipmentAvailabilityData(widget.id)} />;
    case 'maintenance':
      return <PreventiveMaintenanceWidget data={getMaintenanceData(widget.id)} />;
    case 'notifications':
      return <NotificationsWidget data={getNotificationsData(widget.id)} />;
    case 'performance':
      return <DashboardSalesPerformanceScoreWidget />;
    case 'pipeline':
      if (widget.id === 'sales-pipeline' || widget.id === 'leads-pipeline') {
        return <SalesPipelineWidget data={getListData(widget.id)} />;
      }
      if (widget.id === 'rental-pipeline') {
        return <SharedSalesPipelineWidget variant="rental" />;
      }
      return <SalesPipelineWidget data={getListData(widget.id)} />;
    case 'priority':
      if (widget.id === 'daily-actions') {
        return <DailyActionsPriorityWidget data={getDailyActionsData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
      }
      return <DailyActionsPriorityWidget data={getListData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
    case 'daily-actions':
      return <DailyActionsPriorityWidget data={getDailyActionsData(widget.id)} widgetSize={dailyActionsWidgetSize(widgetSize)} />;
    case 'analytics':
      return <div>Widget analytics: {widget.title}</div>;
    default:
      return <div>Type de widget non reconnu: {widget.type}</div>;
  }
};
