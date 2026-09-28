import React from 'react';
import { Globe, FileText, DollarSign, Package, Mail, Calendar, Zap, BarChart3 } from 'lucide-react';

interface SidebarMenuProps {
  dashboardConfig?: any;
  layout?: any;
}

export default function SidebarMenu({ dashboardConfig, layout }: SidebarMenuProps) {
  // Afficher seulement quand le dashboard est configuré
  if (!dashboardConfig || !dashboardConfig.widgets || !layout?.lg || layout.lg.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          Services en commun
          <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
            📧 Messages prioritaires
          </span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <a
            href="#vitrine"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
          >
            <Globe className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-gray-700">Vitrine</span>
          </a>
          <a
            href="#publication"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
          >
            <FileText className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-gray-700">Publication</span>
          </a>
          <a
            href="#devis"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
          >
            <DollarSign className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-gray-700">Devis</span>
          </a>
          <a
            href="#documents"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
          >
            <Package className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-gray-700">Documents</span>
          </a>
          <a
            href="#messages"
            className="flex flex-col items-center p-4 bg-gradient-to-br from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 rounded-lg transition-all duration-300 group border-2 border-orange-300 shadow-md hover:shadow-lg relative overflow-hidden"
          >
            {/* Indicateur de nouveaux messages */}
            <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            
            <Mail className="h-6 w-6 text-orange-700 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-orange-800">Boîte de réception</span>
            
            {/* Effet de brillance */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
          </a>
          <a
            href="#planning"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
          >
            <Calendar className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-gray-700">Planning</span>
          </a>
          <a
            href="#dashboard-entreprise"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
          >
            <BarChart3 className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-gray-700">Tableau de bord</span>
          </a>
        </div>
      </div>
    </div>
  );
} 