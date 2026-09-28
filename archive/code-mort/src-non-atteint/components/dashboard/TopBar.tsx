import React from 'react';
import { Plus, Save, Download, Bell, Settings, RefreshCw, User } from 'lucide-react';

interface TopBarProps {
  selectedMetier?: string;
  dashboardConfig?: any;
  onAddWidgets: () => void;
  onSaveDashboard: () => void;
  onLoadDashboard: () => void;
  onRefreshData: () => void;
}

export default function TopBar({
  selectedMetier,
  dashboardConfig,
  onAddWidgets,
  onSaveDashboard,
  onLoadDashboard,
  onRefreshData
}: TopBarProps) {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Tableau de Bord Entreprise
            </h1>
            <p className="text-sm text-gray-600">
              {selectedMetier && `Métier: ${selectedMetier.charAt(0).toUpperCase() + selectedMetier.slice(1)}`}
              {dashboardConfig && dashboardConfig.widgets && (
                <span className="ml-2 text-orange-600">
                  • {dashboardConfig.widgets.filter((w: any) => w.enabled).length} widgets actifs
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={onAddWidgets}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter des widgets
            </button>

            <button
              onClick={onSaveDashboard}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
              title="Enregistrer le tableau de bord"
            >
              <Save className="h-4 w-4 mr-2" />
              Enregistrer
            </button>

            <button
              onClick={onLoadDashboard}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center"
              title="Charger un tableau de bord sauvegardé"
            >
              <Download className="h-4 w-4 mr-2" />
              Charger
            </button>

            <button className="p-2 text-gray-400 hover:text-gray-600">
              <Bell className="h-6 w-6" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600">
              <Settings className="h-6 w-6" />
            </button>
            <button
              onClick={onRefreshData}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Rafraîchir les données"
            >
              <RefreshCw className="h-6 w-6" />
            </button>
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
} 