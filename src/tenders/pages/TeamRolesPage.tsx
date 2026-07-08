/**
 * Équipe & rôles — l'administrateur attribue à chaque salarié un rôle du
 * module (Lecteur / Rédacteur / Validateur / Administrateur). Ce rôle pilote
 * RÉELLEMENT ses droits partout dans le module (cf. `can`).
 *
 * Source des personnes :
 *  - comptes RÉELS de la société (RPC get_org_members, via useTeamMembers)
 *    quand l'application est connectée à une organisation ;
 *  - complétés par des personnes ajoutées manuellement (utile en mode
 *    local/démo, ou pour préparer un rôle avant l'arrivée du salarié).
 *
 * En mode partagé (VITE_TENDERS_SHARED), le rôle attribué ici est hérité
 * automatiquement par le salarié quand il se connecte sur son poste
 * (cf. tendersSync). Tant que le partage n'est pas activé, l'attribution
 * sert à préparer l'organisation et à simuler les droits.
 */

import React, { useMemo, useState } from 'react';
import { Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import { useTeamMembers } from '../hooks/useTeamMembers';
import { isTendersSharedConfigured } from '../../utils/api/tendersWorkspace';
import {
  Card,
  EmptyState,
  Field,
  GuideBanner,
  PageHeader,
  SecondaryButton,
  SectionCard,
  Select,
  TextInput,
} from '../components/ui';
import type { UserRole } from '../types';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can, defaultTenderRole, uid } from '../types';
import { toast } from '../../utils/toast';

interface Row {
  memberId: string;
  name: string;
  email?: string;
  fromOrg: boolean;
  role: UserRole;
  isMe: boolean;
  /** Présente uniquement via une attribution manuelle (pas un membre listé). */
  manualOnly: boolean;
}

function initials(name: string, email?: string): string {
  const base = (name || '').trim() || email || 'M';
  const parts = base.split(/\s+/).filter(Boolean);
  const raw = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : base.slice(0, 2);
  return raw.toUpperCase();
}

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-primary-100 text-primary-800',
  redacteur: 'bg-blue-100 text-blue-800',
  validateur: 'bg-emerald-100 text-emerald-800',
  lecteur: 'bg-gray-100 text-gray-700',
};

export default function TeamRolesPage() {
  const settings = useTendersStore((s) => s.settings);
  const roleAssignments = useTendersStore((s) => s.roleAssignments);
  const upsertRoleAssignment = useTendersStore((s) => s.upsertRoleAssignment);
  const removeRoleAssignment = useTendersStore((s) => s.removeRoleAssignment);
  const members = useTeamMembers();

  const editable = can(settings.currentUserRole, 'manage_company');
  const shared = isTendersSharedConfigured();
  const currentUserId = settings.currentUserId;

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('lecteur');

  // Fusionne les personnes listées (comptes société + profils locaux) avec les
  // attributions enregistrées ; ajoute en fin les attributions manuelles qui ne
  // correspondent à personne de listé (préparées ou parties de l'effectif).
  const rows = useMemo<Row[]>(() => {
    const byId = new Map(roleAssignments.map((a) => [a.memberId, a]));
    const listedIds = new Set<string>();
    const out: Row[] = members.map((m) => {
      listedIds.add(m.id);
      const a = byId.get(m.id);
      return {
        memberId: m.id,
        name: m.name,
        email: m.email,
        fromOrg: m.fromOrg,
        role: a?.role ?? defaultTenderRole(m.role),
        isMe: !!currentUserId && m.id === currentUserId,
        manualOnly: false,
      };
    });
    for (const a of roleAssignments) {
      if (listedIds.has(a.memberId)) continue;
      out.push({
        memberId: a.memberId,
        name: a.name,
        email: a.email,
        fromOrg: a.fromOrg,
        role: a.role,
        isMe: !!currentUserId && a.memberId === currentUserId,
        manualOnly: true,
      });
    }
    return out;
  }, [members, roleAssignments, currentUserId]);

  const setRole = (row: Row, role: UserRole) => {
    upsertRoleAssignment({
      memberId: row.memberId,
      name: row.name,
      email: row.email,
      role,
      fromOrg: row.fromOrg,
    });
    toast.success(`${row.name || 'Membre'} : ${ROLE_LABELS[role]}.`);
  };

  const addPerson = () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Indiquez au moins un nom.');
      return;
    }
    upsertRoleAssignment({
      memberId: uid('mrole'),
      name,
      email: newEmail.trim() || undefined,
      role: newRole,
      fromOrg: false,
    });
    setNewName('');
    setNewEmail('');
    setNewRole('lecteur');
    toast.success(`${name} ajouté(e) comme ${ROLE_LABELS[newRole]}.`);
  };

  const counts = useMemo(() => {
    const c: Record<UserRole, number> = { admin: 0, redacteur: 0, validateur: 0, lecteur: 0 };
    for (const r of rows) c[r.role] += 1;
    return c;
  }, [rows]);

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Équipe & rôles"
        description="Attribuez à chaque salarié un rôle : il détermine ce qu'il peut faire (lire, rédiger, valider, administrer)."
      />

      {/* Explication du mode de fonctionnement */}
      {shared ? (
        <GuideBanner>
          Partage d'équipe <strong>activé</strong> — chaque salarié connecté à votre société hérite
          automatiquement du rôle que vous lui attribuez ici, sur son propre poste.
        </GuideBanner>
      ) : (
        <GuideBanner>
          Mode local — les rôles servent pour l'instant à organiser l'équipe et à simuler les
          droits. Activez le <strong>partage d'équipe</strong> (Paramètres) pour que chaque salarié
          hérite de son rôle sur son poste.
        </GuideBanner>
      )}

      {!editable && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Lecture seule — seul un <strong>Administrateur</strong> peut attribuer les rôles (votre
          rôle actuel : {ROLE_LABELS[settings.currentUserRole]}).
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Liste des personnes + attribution */}
        <SectionCard
          title="Membres de l'équipe"
          hint={
            shared
              ? 'Comptes réels de votre société (invités depuis la gestion d\'équipe) et personnes préparées.'
              : 'Ajoutez vos salariés ci-dessous. Une fois le partage activé, les comptes réels apparaîtront ici.'
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<UserCog className="h-10 w-10" />}
              title="Aucune personne pour le moment"
              message="Ajoutez un premier salarié ci-dessous et attribuez-lui un rôle. En mode partagé, les comptes de votre société apparaîtront automatiquement."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <div
                    key={row.memberId}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                        {initials(row.name, row.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-gray-900">
                            {row.name || 'Sans nom'}
                          </span>
                          {row.isMe && (
                            <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Vous
                            </span>
                          )}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              row.fromOrg ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {row.fromOrg ? 'Compte société' : 'Ajout manuel'}
                          </span>
                        </div>
                        {row.email && (
                          <div className="truncate text-xs text-gray-500">{row.email}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`hidden rounded-full px-2 py-1 text-xs font-medium sm:inline ${ROLE_BADGE[row.role]}`}
                      >
                        {ROLE_LABELS[row.role]}
                      </span>
                      <div className="w-44">
                        <Select
                          value={row.role}
                          disabled={!editable}
                          onChange={(e) => setRole(row, e.target.value as UserRole)}
                          aria-label={`Rôle de ${row.name}`}
                        >
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      {editable && row.manualOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            removeRoleAssignment(row.memberId);
                            toast.success(`${row.name || 'Personne'} retiré(e) de la liste.`);
                          }}
                          className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                          aria-label="Retirer cette personne"
                          title="Retirer cette personne (ajout manuel)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ajout manuel d'une personne */}
          {editable && (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4">
              <div className="mb-3 text-sm font-medium text-gray-800">Ajouter une personne</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end">
                <Field label="Nom">
                  <TextInput
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Prénom Nom"
                    onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                  />
                </Field>
                <Field label="Email (facultatif)">
                  <TextInput
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="salarie@entreprise.com"
                    onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                  />
                </Field>
                <Field label="Rôle">
                  <Select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SecondaryButton onClick={addPerson}>
                  <Plus className="h-4 w-4" /> Ajouter
                </SecondaryButton>
              </div>
              {shared && (
                <p className="mt-2 text-xs text-gray-400">
                  Pour donner un accès réel à un salarié, invitez-le depuis la gestion d'équipe de
                  votre société (Espace Pro) : son compte apparaîtra ici automatiquement.
                </p>
              )}
            </div>
          )}
        </SectionCard>

        {/* Légende des rôles */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ShieldCheck className="h-4 w-4 text-primary-500" /> Ce que permet chaque rôle
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <div key={r} className="rounded-lg border border-gray-200 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[r]}`}>
                    {ROLE_LABELS[r]}
                  </span>
                  <span className="text-xs text-gray-400">{counts[r]} personne(s)</span>
                </div>
                <p className="text-xs text-gray-600">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
