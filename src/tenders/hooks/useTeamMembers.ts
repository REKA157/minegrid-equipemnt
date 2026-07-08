/**
 * Liste unifiée des personnes affectables dans le module Appels d'offres.
 *
 * - Membres RÉELS de la société (via la RPC `get_org_members`, si
 *   l'utilisateur est connecté à une organisation) — porteurs d'un id de
 *   compte (user_id), ce qui permettra l'affectation collaborative en P3.
 * - Complétés par les profils de la Base entreprise (company.team, locaux)
 *   qui ne correspondent pas déjà à un membre réel.
 *
 * Lecture tolérante : si la RPC échoue ou si l'app n'est pas connectée,
 * on retombe simplement sur company.team — rien ne casse en mode local.
 */

import { useEffect, useState } from 'react';
import { useTendersStore } from '../store/tendersStore';
import { getOrgMembers } from '../../utils/api/organization';

export interface TeamOption {
  /** user_id du compte si membre réel de l'org, sinon id local du profil. */
  id: string;
  name: string;
  role?: string;
  /** true = membre réel de la société (compte), false = profil local. */
  fromOrg: boolean;
}

function memberName(first: string | null, last: string | null, email: string | null): string {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || email || 'Membre';
}

export function useTeamMembers(): TeamOption[] {
  const companyTeam = useTendersStore((s) => s.company.team);
  const [orgMembers, setOrgMembers] = useState<TeamOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    getOrgMembers()
      .then((members) => {
        if (cancelled) return;
        setOrgMembers(
          members.map((m) => ({
            id: m.user_id,
            name: memberName(m.first_name, m.last_name, m.email),
            role: m.role,
            fromOrg: true,
          })),
        );
      })
      .catch(() => {
        /* mode local : on garde uniquement company.team */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Priorité aux membres réels ; complète avec l'équipe locale (dédup par nom).
  const seen = new Set(orgMembers.map((o) => o.name.trim().toLowerCase()));
  const local: TeamOption[] = companyTeam
    .filter((m) => m.name.trim() && !seen.has(m.name.trim().toLowerCase()))
    .map((m) => ({ id: m.id, name: m.name, role: m.role, fromOrg: false }));

  return [...orgMembers, ...local];
}
