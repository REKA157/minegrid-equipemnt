import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import supabase from '../../../utils/supabaseClient';
import { createIntervention } from '../../../utils/enterpriseApi/interventions';
import { getTechnicians } from '../../../utils/enterpriseApi/technicians';
import {
  getCurrentSellerUserId,
  getMachineIdsForSellerUser,
} from '../../../utils/enterpriseApi/sellerScope';

type MachineOption = {
  id: string;
  label: string;
};

type TechnicianOption = {
  id: string;
  name: string;
  specialization?: string | null;
  availability_status?: string | null;
};

interface QuickInterventionFormProps {
  open: boolean;
  onClose: () => void;
  /** Appelé après création réussie (avant fermeture). Utilisé pour rafraîchir les widgets. */
  onCreated?: () => void;
}

const PRIORITIES: Array<{ value: 'Basse' | 'Moyenne' | 'Haute'; label: string; tone: string }> = [
  { value: 'Basse', label: 'Basse', tone: 'text-gray-600 bg-gray-100' },
  { value: 'Moyenne', label: 'Moyenne', tone: 'text-orange-700 bg-orange-100' },
  { value: 'Haute', label: 'Haute', tone: 'text-red-700 bg-red-100' },
];

function todayLocalISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const QuickInterventionForm: React.FC<QuickInterventionFormProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [equipmentId, setEquipmentId] = useState<string>('');
  const [technicianId, setTechnicianId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<'Basse' | 'Moyenne' | 'Haute'>('Moyenne');
  const [interventionDate, setInterventionDate] = useState<string>(todayLocalISO());
  const [estimatedDuration, setEstimatedDuration] = useState<string>('2');

  // Charge machines + techniciens à l'ouverture
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingOptions(true);
    setError(null);
    setSuccess(false);

    (async () => {
      try {
        const userId = await getCurrentSellerUserId();
        if (!userId) {
          if (!cancelled) {
            setError('Veuillez vous reconnecter pour créer une intervention.');
            setLoadingOptions(false);
          }
          return;
        }

        const [machineIds, technicianRows] = await Promise.all([
          getMachineIdsForSellerUser(userId),
          getTechnicians() as Promise<TechnicianOption[]>,
        ]);

        let machineOptions: MachineOption[] = [];
        if (machineIds.length > 0) {
          const { data: machineData } = await supabase
            .from('machines')
            .select('id, name, brand, model')
            .in('id', machineIds);
          machineOptions = (machineData || []).map((m: any) => ({
            id: String(m.id),
            label: `${m.brand || ''} ${m.model || m.name || 'Équipement'}`.trim(),
          }));
        }

        // Fallback : récupérer toutes les machines visibles si rien côté seller
        if (machineOptions.length === 0) {
          const { data: anyMachines } = await supabase
            .from('machines')
            .select('id, name, brand, model')
            .order('created_at', { ascending: false })
            .limit(50);
          machineOptions = (anyMachines || []).map((m: any) => ({
            id: String(m.id),
            label: `${m.brand || ''} ${m.model || m.name || 'Équipement'}`.trim(),
          }));
        }

        if (!cancelled) {
          setMachines(machineOptions);
          setTechnicians(technicianRows || []);
          if (machineOptions[0]) setEquipmentId((prev) => prev || machineOptions[0].id);
        }
      } catch (e) {
        if (!cancelled) {
          setError('Impossible de charger les équipements et techniciens.');
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset form à la fermeture
  useEffect(() => {
    if (open) return;
    setEquipmentId('');
    setTechnicianId('');
    setDescription('');
    setPriority('Moyenne');
    setInterventionDate(todayLocalISO());
    setEstimatedDuration('2');
    setError(null);
    setSuccess(false);
  }, [open]);

  const canSubmit = useMemo(
    () => !!equipmentId && description.trim().length >= 5 && !!interventionDate && !submitting,
    [equipmentId, description, interventionDate, submitting],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSubmitting(true);
    try {
      await createIntervention({
        equipment_id: equipmentId,
        description: description.trim(),
        technician_id: technicianId || undefined,
        intervention_date: new Date(interventionDate).toISOString(),
        priority,
      });

      setSuccess(true);
      onCreated?.();
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
      setTimeout(() => onClose(), 900);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la création de l\'intervention.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Nouvelle intervention
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          {success ? (
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Intervention créée. Mise à jour du planning…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Equipement */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Équipement <span className="text-red-500">*</span>
                </label>
                <select
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  disabled={loadingOptions || machines.length === 0}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                >
                  {loadingOptions && <option value="">Chargement…</option>}
                  {!loadingOptions && machines.length === 0 && (
                    <option value="">Aucun équipement disponible</option>
                  )}
                  {!loadingOptions &&
                    machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex : Vidange + remplacement filtres"
                  rows={2}
                  className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <div className="mt-1 text-[11px] text-gray-500">
                  Minimum 5 caractères
                </div>
              </div>

              {/* Date + Durée */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Date prévue <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={interventionDate}
                    onChange={(e) => setInterventionDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Durée estimée (h)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={estimatedDuration}
                    onChange={(e) => setEstimatedDuration(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Priorité */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Priorité</label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      type="button"
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`flex-1 rounded border px-3 py-1.5 text-xs font-medium transition ${
                        priority === p.value
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technicien */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Technicien (optionnel)
                </label>
                <select
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  disabled={loadingOptions}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                >
                  <option value="">Non assigné</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.specialization ? ` — ${t.specialization}` : ''}
                      {t.availability_status && t.availability_status !== 'Disponible'
                        ? ` (${t.availability_status})`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {!success && (
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-1.5 rounded bg-orange-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Création…' : "Créer l'OT"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default QuickInterventionForm;
