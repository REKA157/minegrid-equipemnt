import React from 'react';
import {
  Activity,
  Clock,
  Fuel,
  Thermometer,
  Gauge,
  Wrench,
  Calendar,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import type { Site } from './MonitorMap';

export interface Equipment {
  id: string;
  name: string;
  model: string;
  status: 'running' | 'idle' | 'maintenance' | 'stopped';
  hoursUsed: number;
  fuelLevel: number;
  temperature: number;
  nextMaintenance: string;
  efficiency: number;
}

interface EquipmentDetailProps {
  site: Site | null;
  equipment: Equipment[];
}

const eqStatusConfig = {
  running:     { bg: 'bg-green-100 text-green-700', label: 'En marche' },
  idle:        { bg: 'bg-blue-100 text-blue-700',   label: 'Au repos' },
  maintenance: { bg: 'bg-amber-100 text-amber-700', label: 'Maintenance' },
  stopped:     { bg: 'bg-red-100 text-red-700',     label: 'Arrêté' },
};

function MetricCard({ icon: Icon, label, value, unit, accent }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
  accent?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${accent ?? 'text-gray-400'}`} />
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-800">
        {value}<span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

export default function EquipmentDetail({ site, equipment }: EquipmentDetailProps) {
  if (!site) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 p-6 text-center">
        <Activity className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Sélectionnez un site</p>
        <p className="text-xs text-gray-400 mt-1">pour voir le détail des équipements</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <h3 className="text-sm font-semibold text-gray-800">{site.name}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{site.country} — {equipment.length} machine{equipment.length > 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {equipment.length === 0 && (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Aucun équipement sur ce site</p>
          </div>
        )}

        {equipment.map((eq) => {
          const st = eqStatusConfig[eq.status];
          return (
            <div key={eq.id} className="border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{eq.name}</p>
                  <p className="text-xs text-gray-500">{eq.model}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.bg}`}>
                  {st.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={Clock}        label="Heures"       value={eq.hoursUsed.toLocaleString()}  unit="h"  accent="text-blue-500" />
                <MetricCard icon={Fuel}          label="Carburant"    value={eq.fuelLevel}                   unit="%"  accent="text-amber-500" />
                <MetricCard icon={Thermometer}   label="Température"  value={eq.temperature}                 unit="°C" accent="text-red-500" />
                <MetricCard icon={TrendingUp}    label="Rendement"    value={eq.efficiency}                  unit="%"  accent="text-green-500" />
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  Prochaine maint.
                </span>
                <span className="flex items-center gap-1 font-medium text-gray-700">
                  <Calendar className="h-3 w-3" />
                  {eq.nextMaintenance}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
