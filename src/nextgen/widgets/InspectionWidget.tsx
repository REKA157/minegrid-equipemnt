import React, { useMemo, useState } from 'react';
import { SectionCard, EmptyState, StatusBadge } from '../ui/primitives';
import { isDemoBackend } from '../ui/demoMode';
import { computeOverallGrade, type ComponentGrade, type InspectionFindings } from '../inspection/inspectionGrade';
import { requestInspection } from '../inspection/inspectionService';

const COMPONENTS: Array<{ key: keyof InspectionFindings; label: string }> = [
  { key: 'engine', label: 'Moteur (critique)' },
  { key: 'structure', label: 'Structure (critique)' },
  { key: 'hydraulics', label: 'Hydraulique' },
  { key: 'undercarriage', label: 'Train' },
  { key: 'electrical', label: 'Électrique' },
];
const GRADES: ComponentGrade[] = ['A', 'B', 'C', 'D', 'F'];

/** Calculer un grade d'inspection (logique réelle). */
export function InspectionGradeWidget() {
  const [findings, setFindings] = useState<InspectionFindings>({ engine: 'A', structure: 'A', hydraulics: 'B' });
  const result = useMemo(() => computeOverallGrade(findings), [findings]);

  return (
    <SectionCard title="Calculer un grade machine" subtitle="Notez les composants : grade global pondéré (un F critique déclasse)." live status="available">
      <div className="grid sm:grid-cols-2 gap-4">
        {COMPONENTS.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">{label}</span>
            <select value={findings[key] ?? ''} onChange={(e) => setFindings((f) => ({ ...f, [key]: (e.target.value || undefined) as ComponentGrade }))}
              className="w-24 rounded-md border border-gray-300 px-2 py-1">
              <option value="">—</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-lg bg-gray-50 p-4">
        {result.grade ? (
          <>
            <div className="text-4xl font-bold text-gray-900">{result.grade}</div>
            <div className="text-sm text-gray-600">Score pondéré {result.score}/4 · {result.assessed} composants</div>
          </>
        ) : (
          <EmptyState status="unverified" message="Aucun composant évalué — grade non calculable." />
        )}
      </div>
    </SectionCard>
  );
}

/** Demander une inspection (formulaire interactif, résultat HONNÊTE). */
export function InspectionRequestWidget() {
  const [machineRef, setMachineRef] = useState('CAT 320D — Dakar');
  const [location, setLocation] = useState('Dakar, Sénégal');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const onRequest = async () => {
    if (!machineRef.trim()) return;
    if (isDemoBackend()) {
      // Aucune fausse confirmation : la demande est « préparée », pas « créée ».
      setResult({
        ok: true,
        message: `Demande préparée pour « ${machineRef} » à ${location || '—'}. En attente d'activation d'un inspecteur partenaire sur le corridor.`,
      });
      return;
    }
    setPending(true);
    const r = await requestInspection({ machine_id: machineRef, location });
    setPending(false);
    setResult({ ok: r.ok, message: r.ok ? `Demande d'inspection créée (réf. ${r.id}).` : (r.error ?? 'Échec.') });
  };

  return (
    <SectionCard title="Demander une inspection" subtitle="Renseignez la machine et le lieu, puis lancez la demande." live status={isDemoBackend() ? 'awaiting_partner' : 'available'}>
      <div className="space-y-2 text-sm">
        <label className="block">
          <span className="text-gray-700">Machine</span>
          <input className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1" value={machineRef} onChange={(e) => setMachineRef(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-gray-700">Lieu</span>
          <input className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <button onClick={onRequest} disabled={pending}
        className="mt-3 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
        {pending ? 'Envoi…' : 'Demander l\'inspection'}
      </button>
      {result && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm flex items-start gap-2">
          <StatusBadge status={isDemoBackend() ? 'awaiting_partner' : (result.ok ? 'available' : 'unverified')} />
          <span className="text-gray-700">{result.message}</span>
        </div>
      )}
    </SectionCard>
  );
}
