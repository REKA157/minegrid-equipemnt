import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  createDelivery,
  getDriversList,
  getVehiclesList,
  type DriverRow,
  type VehicleRow,
  type DeliveryPriority,
} from '../../../utils/enterpriseApi/transport';

interface QuickDeliveryFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const PRIORITIES: Array<{ value: DeliveryPriority; label: string }> = [
  { value: 'Basse', label: 'Basse' },
  { value: 'Moyenne', label: 'Moyenne' },
  { value: 'Haute', label: 'Haute' },
  { value: 'Urgente', label: 'Urgente' },
];

function todayLocalISO(offsetHours = 0): string {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const QuickDeliveryForm: React.FC<QuickDeliveryFormProps> = ({ open, onClose, onCreated }) => {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [equipmentLabel, setEquipmentLabel] = useState('');
  const [originAddress, setOriginAddress] = useState('Dépôt principal');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [pickupDate, setPickupDate] = useState(todayLocalISO(1));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(todayLocalISO(6));
  const [distanceKm, setDistanceKm] = useState('');
  const [transportCost, setTransportCost] = useState('');
  const [priority, setPriority] = useState<DeliveryPriority>('Moyenne');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingOptions(true);
    setError(null);
    setSuccess(false);
    (async () => {
      try {
        const [d, v] = await Promise.all([getDriversList(), getVehiclesList()]);
        if (!cancelled) {
          setDrivers(d || []);
          setVehicles(v || []);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger chauffeurs / véhicules.');
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setEquipmentLabel('');
    setOriginAddress('Dépôt principal');
    setDestinationAddress('');
    setPickupDate(todayLocalISO(1));
    setExpectedDeliveryDate(todayLocalISO(6));
    setDistanceKm('');
    setTransportCost('');
    setPriority('Moyenne');
    setDriverId('');
    setVehicleId('');
    setClientName('');
    setClientPhone('');
    setError(null);
    setSuccess(false);
  }, [open]);

  const canSubmit = useMemo(
    () =>
      equipmentLabel.trim().length >= 3 &&
      destinationAddress.trim().length >= 3 &&
      !!pickupDate &&
      !!expectedDeliveryDate &&
      !submitting,
    [equipmentLabel, destinationAddress, pickupDate, expectedDeliveryDate, submitting],
  );

  const availableDrivers = useMemo(
    () => drivers.filter((d) => d.availability_status === 'Disponible'),
    [drivers],
  );
  const availableVehicles = useMemo(
    () => vehicles.filter((v) => v.status === 'Disponible'),
    [vehicles],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await createDelivery({
        equipment_label: equipmentLabel.trim(),
        origin_address: originAddress.trim() || 'Dépôt principal',
        destination_address: destinationAddress.trim(),
        pickup_date: new Date(pickupDate).toISOString(),
        expected_delivery_date: new Date(expectedDeliveryDate).toISOString(),
        distance_km: distanceKm ? Number(distanceKm) : null,
        transport_cost: transportCost ? Number(transportCost) : null,
        priority,
        driver_id: driverId || null,
        vehicle_id: vehicleId || null,
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
      });
      setSuccess(true);
      onCreated?.();
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
      setTimeout(() => onClose(), 900);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la création de la livraison.');
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
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Nouvelle livraison</h2>
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
              Livraison planifiée. Mise à jour du planning…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Équipement */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Équipement à transporter <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={equipmentLabel}
                  onChange={(e) => setEquipmentLabel(e.target.value)}
                  placeholder="Ex : Pelle Caterpillar 320D"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Origine + Destination */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Origine</label>
                  <input
                    type="text"
                    value={originAddress}
                    onChange={(e) => setOriginAddress(e.target.value)}
                    placeholder="Dépôt principal"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Destination <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    placeholder="Adresse client"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Enlèvement <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Livraison prévue <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Distance + Coût */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Distance (km)</label>
                  <input
                    type="number"
                    min={0}
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    placeholder="240"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Coût transport (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={transportCost}
                    onChange={(e) => setTransportCost(e.target.value)}
                    placeholder="4500"
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
                      className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition ${
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

              {/* Chauffeur + Véhicule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Chauffeur</label>
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    disabled={loadingOptions}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                  >
                    <option value="">Non assigné</option>
                    {availableDrivers.length > 0 && (
                      <optgroup label="Disponibles">
                        {availableDrivers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {drivers.filter((d) => d.availability_status !== 'Disponible').length > 0 && (
                      <optgroup label="Indisponibles">
                        {drivers
                          .filter((d) => d.availability_status !== 'Disponible')
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.availability_status})
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Véhicule</label>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    disabled={loadingOptions}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                  >
                    <option value="">Non assigné</option>
                    {availableVehicles.length > 0 && (
                      <optgroup label="Disponibles">
                        {availableVehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.plate_number} — {v.type}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {vehicles.filter((v) => v.status !== 'Disponible').length > 0 && (
                      <optgroup label="Indisponibles">
                        {vehicles
                          .filter((v) => v.status !== 'Disponible')
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.plate_number} ({v.status})
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Client */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Client</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Nom du client"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Téléphone</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+212 6 ..."
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
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
                {submitting ? 'Création…' : 'Planifier la livraison'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default QuickDeliveryForm;
