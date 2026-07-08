/**
 * Onglet Tâches : gestion simple des tâches du dossier (titre, responsable,
 * échéance, statut, commentaire). Les tâches en retard sont mises en
 * évidence. Tout est éditable en ligne.
 */

import React, { useState } from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import { useTendersStore } from '../../store/tendersStore';
import {
  EmptyState,
  GuideBanner,
  PrimaryButton,
  Select,
  SectionCard,
  TextInput,
} from '../../components/ui';
import type { Tender, TenderTask } from '../../types';
import { can, daysUntil, uid } from '../../types';

const TASK_STATUS_LABELS: Record<TenderTask['status'], string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  fait: 'Fait',
};

export default function TasksTab({ tender }: { tender: Tender }) {
  const upsertTask = useTendersStore((s) => s.upsertTask);
  const deleteTask = useTendersStore((s) => s.deleteTask);
  const settings = useTendersStore((s) => s.settings);
  const [filter, setFilter] = useState<'toutes' | TenderTask['status']>('toutes');

  const editable = can(settings.currentUserRole, 'edit');
  const tasks = tender.tasks;
  const shown = filter === 'toutes' ? tasks : tasks.filter((t) => t.status === filter);
  const late = tasks.filter((t) => t.status !== 'fait' && daysUntil(t.dueDate) < 0);

  const addTask = () => {
    upsertTask(tender.id, {
      id: uid('t'),
      title: '',
      assignee: settings.currentUserName,
      dueDate: new Date().toISOString().slice(0, 10),
      status: 'a_faire',
    });
  };

  const update = (task: TenderTask, patch: Partial<TenderTask>) => {
    upsertTask(tender.id, { ...task, ...patch });
  };

  return (
    <div className="space-y-6">
      {late.length > 0 && (
        <GuideBanner>
          ⏰ <strong>{late.length} tâche(s) en retard</strong> :{' '}
          {late.map((t) => t.title || '(sans titre)').join(' · ')}
        </GuideBanner>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['toutes', 'a_faire', 'en_cours', 'fait'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'toutes' ? `Toutes (${tasks.length})` : TASK_STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        {editable && (
          <PrimaryButton onClick={addTask}>
            <Plus className="h-4 w-4" /> Nouvelle tâche
          </PrimaryButton>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-10 w-10" />}
          title="Aucune tâche"
          message="Créez les tâches de production du dossier (obtenir la caution, rédiger le mémoire, chiffrer le BPU…) et affectez un responsable et une échéance à chacune."
          action={
            editable ? (
              <PrimaryButton onClick={addTask}>
                <Plus className="h-4 w-4" /> Créer la première tâche
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <SectionCard title="Tâches du dossier" hint="Modification en ligne — tout est enregistré automatiquement.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="min-w-[220px] py-2 pr-3">Tâche</th>
                  <th className="w-40 py-2 pr-3">Responsable</th>
                  <th className="w-40 py-2 pr-3">Échéance</th>
                  <th className="w-32 py-2 pr-3">Statut</th>
                  <th className="min-w-[160px] py-2 pr-3">Commentaire</th>
                  {editable && <th className="w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((t) => {
                  const overdue = t.status !== 'fait' && daysUntil(t.dueDate) < 0;
                  return (
                    <tr key={t.id} className={overdue ? 'bg-red-50/40' : t.status === 'fait' ? 'opacity-60' : ''}>
                      <td className="py-2 pr-3">
                        <TextInput
                          value={t.title}
                          disabled={!editable}
                          onChange={(e) => update(t, { title: e.target.value })}
                          placeholder="Décrire la tâche…"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <TextInput
                          value={t.assignee}
                          disabled={!editable}
                          onChange={(e) => update(t, { assignee: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <TextInput
                          type="date"
                          value={t.dueDate.slice(0, 10)}
                          disabled={!editable}
                          onChange={(e) => update(t, { dueDate: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          value={t.status}
                          disabled={!editable}
                          onChange={(e) => update(t, { status: e.target.value as TenderTask['status'] })}
                        >
                          <option value="a_faire">À faire</option>
                          <option value="en_cours">En cours</option>
                          <option value="fait">Fait</option>
                        </Select>
                      </td>
                      <td className="py-2 pr-3">
                        <TextInput
                          value={t.comment ?? ''}
                          disabled={!editable}
                          onChange={(e) => update(t, { comment: e.target.value })}
                          placeholder="Note…"
                        />
                      </td>
                      {editable && (
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => deleteTask(tender.id, t.id)}
                            className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                            aria-label="Supprimer la tâche"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
