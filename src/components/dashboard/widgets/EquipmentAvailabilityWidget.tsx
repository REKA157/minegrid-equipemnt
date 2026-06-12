import React, { useState } from 'react';
import { CheckCircle, Clock, Wrench, MapPin, AlertTriangle, ChevronDown, ChevronUp, Truck } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  status: 'available' | 'rented' | 'maintenance';
  location: string;
  lastUpdate: string;
  returnDate?: string;
  nextMaintenance?: string;
}

interface EquipmentAvailabilityWidgetProps {
  data: Equipment[];
  widgetSize?: string;
}

const STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, dot: 'bg-green-500' },
  rented: { label: 'En location', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', icon: Truck, dot: 'bg-orange-500' },
  maintenance: { label: 'Maintenance', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: Wrench, dot: 'bg-red-500' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "À l'instant";
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${Math.floor(hours / 24)}j`;
}

export default function EquipmentAvailabilityWidget({ data, widgetSize }: EquipmentAvailabilityWidgetProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'available' | 'rented' | 'maintenance'>('all');

  const total = data.length;
  const available = data.filter((e) => e.status === 'available').length;
  const rented = data.filter((e) => e.status === 'rented').length;
  const maintenance = data.filter((e) => e.status === 'maintenance').length;
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;

  const filtered = filter === 'all' ? data : data.filter((e) => e.status === filter);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Truck className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-2 text-sm font-medium text-gray-700">Aucune donnée de parc</p>
        <p className="mt-1 max-w-xs text-xs text-gray-500">
          Rien à afficher pour ce compte. Vérifiez la connexion ou que le matériel est bien enregistré côté loueur.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Gauge */}
      <div className="flex items-center gap-6">
        <div className="relative h-20 w-20 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'}
              strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-gray-900">{pct}%</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Disponibles
            </span>
            <span className="font-semibold text-green-700">{available}/{total}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> En location
            </span>
            <span className="font-semibold text-orange-700">{rented}/{total}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Maintenance
            </span>
            <span className="font-semibold text-red-700">{maintenance}/{total}</span>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'available', 'rented', 'maintenance'] as const).map((f) => {
          const label = f === 'all' ? 'Tous' : STATUS_CONFIG[f].label;
          const count = f === 'all' ? total : data.filter((e) => e.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                filter === f ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Equipment list */}
      <div className="space-y-2">
        {filtered.map((eq) => {
          const cfg = STATUS_CONFIG[eq.status];
          const Icon = cfg.icon;
          const isOpen = expanded === eq.id;

          return (
            <div key={eq.id}
              className={`border rounded-lg transition-all cursor-pointer ${cfg.border} ${isOpen ? cfg.bg : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setExpanded(isOpen ? null : eq.id)}
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{eq.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                    <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {eq.location}</span>
                    <span>· {timeAgo(eq.lastUpdate)}</span>
                  </div>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-1.5">
                  {eq.returnDate && (
                    <div className="flex items-center gap-1.5 text-xs text-orange-700">
                      <Clock className="h-3 w-3" /> Retour prévu : {fmtDate(eq.returnDate)}
                    </div>
                  )}
                  {eq.nextMaintenance && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-700">
                      <Wrench className="h-3 w-3" /> Prochaine maintenance : {fmtDate(eq.nextMaintenance)}
                    </div>
                  )}
                  {eq.status === 'available' && (
                    <div className="flex items-center gap-1.5 text-xs text-green-700">
                      <CheckCircle className="h-3 w-3" /> Prêt pour location
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-400">Aucun équipement dans cette catégorie</div>
        )}
      </div>

      {/* Alert */}
      {maintenance > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            {maintenance} équipement{maintenance > 1 ? 's' : ''} en maintenance — vérifier le planning de retour.
          </p>
        </div>
      )}
    </div>
  );
}
