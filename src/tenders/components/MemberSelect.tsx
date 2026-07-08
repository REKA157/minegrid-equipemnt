/**
 * Sélecteur de personne affectable (rédacteur / responsable / assigné).
 *
 * Remplace la saisie libre par un choix parmi les membres réels de l'équipe
 * (get_org_members) et les profils de la Base entreprise. Conserve la
 * valeur actuelle même si elle n'est pas dans la liste (dossiers importés,
 * anciens noms), et permet toujours « Non affecté ».
 *
 * onChange renvoie le NOM (stocké tel quel, rétro-compatible) ET l'option
 * membre choisie (pour capter l'id de compte du rédacteur en P3).
 */

import React from 'react';
import { Select } from './ui';
import { useTeamMembers, type TeamOption } from '../hooks/useTeamMembers';

const ROLE_SHORT: Record<string, string> = {
  owner: 'propriétaire',
  admin: 'admin',
  manager: 'manager',
  viewer: 'lecteur',
};

export function MemberSelect({
  value,
  onChange,
  disabled,
  allowUnassigned = true,
}: {
  value: string;
  onChange: (name: string, member: TeamOption | null) => void;
  disabled?: boolean;
  allowUnassigned?: boolean;
}) {
  const members = useTeamMembers();

  // Noms proposés : membres de l'équipe + valeur courante si absente de la liste.
  const known = new Set(members.map((m) => m.name));
  const extraCurrent = value && !known.has(value) ? [value] : [];

  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const name = e.target.value;
        onChange(name, members.find((m) => m.name === name) ?? null);
      }}
    >
      {allowUnassigned && <option value="">— Non affecté —</option>}
      {members.map((m) => (
        <option key={`${m.fromOrg ? 'org' : 'loc'}-${m.id}`} value={m.name}>
          {m.name}
          {m.role ? ` (${ROLE_SHORT[m.role] ?? m.role})` : ''}
          {m.fromOrg ? '' : ' — profil local'}
        </option>
      ))}
      {extraCurrent.map((n) => (
        <option key={`cur-${n}`} value={n}>
          {n} (saisi manuellement)
        </option>
      ))}
    </Select>
  );
}
