import React from 'react';
import { MapPin, Wifi, WifiOff, AlertTriangle, ChevronRight } from 'lucide-react';
import type { Site } from './MonitorMap';

interface SiteListProps {
  sites: Site[];
  selectedSiteId: string | null;
  onSelectSite: (id: string) => void;
}

const statusBadge = {
  online:  { bg: 'bg-green-100 text-green-700', icon: Wifi,          label: 'En ligne' },
  offline: { bg: 'bg-red-100 text-red-700',     icon: WifiOff,       label: 'Hors ligne' },
  warning: { bg: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Alerte' },
};

export default function SiteList({ sites, selectedSiteId, onSelectSite }: SiteListProps) {
  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <h3 className="text-sm font-semibold text-gray-800">Sites &amp; Chantiers</h3>
        <p className="text-xs text-gray-500 mt-0.5">{sites.length} site{sites.length > 1 ? 's' : ''} enregistré{sites.length > 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {sites.map((site) => {
          const badge = statusBadge[site.status];
          const Icon = badge.icon;
          const isSelected = site.id === selectedSiteId;

          return (
            <button
              key={site.id}
              onClick={() => onSelectSite(site.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors
                ${isSelected ? 'bg-primary-50 border-l-2 border-primary-500' : 'hover:bg-gray-50 border-l-2 border-transparent'}`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-800'}`}>
                  {site.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" />
                    {site.country}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.bg}`}>
                    <Icon className="h-2.5 w-2.5" />
                    {badge.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span className="font-medium text-gray-600">{site.equipmentCount}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
