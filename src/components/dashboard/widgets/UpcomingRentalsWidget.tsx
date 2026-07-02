import React, { useState } from 'react';
import { Calendar, MapPin, User, Clock, DollarSign, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

interface Rental {
  id: string;
  equipment: string;
  client: string;
  clientPhone?: string;
  location: string;
  startDate: string;
  endDate: string;
  dailyRate: number;
  status: 'confirmed' | 'pending' | 'in_progress';
  notes?: string;
}

interface UpcomingRentalsWidgetProps {
  data: Rental[] | null | undefined;
  widgetSize?: string;
  onAction?: (action: string, data: any) => void;
}

const STATUS_MAP = {
  confirmed: { label: 'Confirmé', color: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-500', Icon: CheckCircle },
  pending: { label: 'En attente', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500', Icon: AlertCircle },
  in_progress: { label: 'En cours', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', Icon: Clock },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function daysBetween(a: string, b: string) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function daysUntil(iso: string) {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'En cours';
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return `Dans ${diff}j`;
}

export default function UpcomingRentalsWidget({ data, widgetSize, onAction }: UpcomingRentalsWidgetProps) {
  /** Anti-façade : données RÉELLES uniquement ; aucune location de démo. Liste vide -> état vide honnête. */
  const rentals = data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const { formatCurrency, madToDisplay, currentCurrency } = useWidgetMadCurrency();

  const sortedRentals = [...rentals].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const totalRevenue = sortedRentals.reduce((sum, r) => {
    const days = daysBetween(r.startDate, r.endDate);
    return sum + r.dailyRate * days;
  }, 0);

  const confirmed = sortedRentals.filter((r) => r.status === 'confirmed').length;
  const pending = sortedRentals.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-blue-700">{sortedRentals.length}</div>
          <div className="text-[10px] text-blue-600">Locations</div>
        </div>
        <div className="bg-green-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-green-700">{confirmed}</div>
          <div className="text-[10px] text-green-600">Confirmées</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-orange-700">
            {(() => {
              const d = madToDisplay(totalRevenue);
              return d >= 1e6 ? `${(d / 1e6).toFixed(1)}M` : `${(d / 1000).toFixed(0)}k`;
            })()}
          </div>
          <div className="text-[10px] text-orange-600">{currentCurrency} prévus</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {sortedRentals.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-500">Aucune location à venir.</p>
        )}
        {sortedRentals.map((rental) => {
          const cfg = STATUS_MAP[rental.status];
          const days = daysBetween(rental.startDate, rental.endDate);
          const isOpen = selected === rental.id;

          return (
            <div key={rental.id}
              className={`border rounded-lg transition-all cursor-pointer ${isOpen ? `${cfg.bg} ${cfg.color.replace('text-', 'border-')}` : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              onClick={() => setSelected(isOpen ? null : rental.id)}
            >
              <div className="flex items-start gap-3 px-3 py-2.5">
                {/* Timeline marker */}
                <div className="flex flex-col items-center mt-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  <div className="w-px h-full bg-gray-200 mt-1" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{rental.equipment}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
                    <span className="flex items-center gap-0.5">
                      <Calendar className="h-3 w-3" /> {fmtDate(rental.startDate)} → {fmtDate(rental.endDate)}
                    </span>
                    <span className="font-medium text-gray-700">{days}j</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" /> {rental.location}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-1.5">
                    <span className="flex items-center gap-1 text-[11px] text-gray-600">
                      <User className="h-3 w-3" /> {rental.client}
                    </span>
                    <span className="text-[11px] font-medium text-orange-700">
                      {daysUntil(rental.startDate)}
                    </span>
                  </div>
                </div>

                <ChevronRight className={`h-4 w-4 text-gray-400 mt-2 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
              </div>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100 ml-7 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <DollarSign className="h-3 w-3 text-gray-400" />
                    {formatCurrency(rental.dailyRate)}/jour · Total:{' '}
                    <span className="font-semibold">{formatCurrency(rental.dailyRate * days)}</span>
                  </div>
                  {rental.clientPhone && (
                    <div className="text-xs text-gray-600">
                      Tel: {rental.clientPhone}
                    </div>
                  )}
                  {rental.notes && (
                    <div className="text-xs text-gray-500 italic bg-gray-50 rounded px-2 py-1">
                      {rental.notes}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAction?.('contact', rental); }}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
                    >
                      Contacter
                    </button>
                    {rental.status === 'pending' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAction?.('confirm', rental); }}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                      >
                        Confirmer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pending > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            {pending} location{pending > 1 ? 's' : ''} en attente de confirmation
          </p>
        </div>
      )}
    </div>
  );
}
