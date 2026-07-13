import {
  AlertTriangle,
  Bell,
  CheckCircle,
  FileText,
  Package,
  Wrench,
} from 'lucide-react';
import React from 'react';
import type { PortalStats } from '../types';

export function OverviewTab({ stats }: { stats: PortalStats | null }) {
  if (!stats) return <div>Chargement des statistiques...</div>;

  const statCards = [
    {
      title: 'Équipements Totaux',
      value: stats.totalEquipment,
      icon: Package,
      color: 'bg-orange-500',
      change: 'Parc total'
    },
    {
      title: 'Équipements Actifs',
      value: stats.activeEquipment,
      icon: CheckCircle,
      color: 'bg-orange-600',
      change: `${((stats.activeEquipment / stats.totalEquipment) * 100).toFixed(1)}%`
    },
    {
      title: 'Commandes en Attente',
      value: stats.pendingOrders,
      icon: FileText,
      color: 'bg-orange-400',
      change: 'À traiter'
    },
    {
      title: 'Interventions à Venir',
      value: stats.upcomingInterventions,
      icon: Wrench,
      color: 'bg-orange-700',
      change: 'Cette semaine'
    },
    {
      title: 'Notifications Non Lues',
      value: stats.unreadNotifications,
      icon: Bell,
      color: 'bg-orange-800',
      change: 'Nouvelles'
    }
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Vue d'ensemble</h2>
      
      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{stat.change}</p>
            </div>
          );
        })}
      </div>

      {/* Alertes dérivées des VRAIES stats (fin des « Équipement #123/#456 » fictifs
          et de l'« Activité Récente » codée en dur). */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Alertes</h3>
        <div className="space-y-3">
          {stats.pendingOrders > 0 && (
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-orange-500 mr-2" />
              <span className="text-sm text-gray-600">{stats.pendingOrders} commande(s) en attente de traitement</span>
            </div>
          )}
          {stats.upcomingInterventions > 0 && (
            <div className="flex items-center">
              <Wrench className="h-4 w-4 text-orange-700 mr-2" />
              <span className="text-sm text-gray-600">{stats.upcomingInterventions} intervention(s) à venir cette semaine</span>
            </div>
          )}
          {stats.unreadNotifications > 0 && (
            <div className="flex items-center">
              <Bell className="h-4 w-4 text-orange-800 mr-2" />
              <span className="text-sm text-gray-600">{stats.unreadNotifications} notification(s) non lue(s)</span>
            </div>
          )}
          {stats.pendingOrders === 0 && stats.upcomingInterventions === 0 && stats.unreadNotifications === 0 && (
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-orange-600 mr-2" />
              <span className="text-sm text-gray-600">Aucune alerte pour le moment.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
