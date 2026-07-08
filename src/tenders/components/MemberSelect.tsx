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

/** Clé stable et unique par membre (évite la collision d'homonymes). */
function optionKey(m: TeamOption): string {
  return `${m.fromOrg ? 'org' : 'loc'}-${m.id}`;
}

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

  // La <option> a pour VALUE une clé unique (pas le nom) : deux homonymes
  // restent distinguables et .find renvoie le bon compte. Valeur affichée
  // = leadWriter/responsible stocké (un nom) → on retrouve l'option par nom
  // pour la sélection courante, en gérant l'ambiguïté par la 1re occurrence
  // (acceptable pour l'affichage ; le CHOIX, lui, passe par la clé unique).
  const currentKey =
    value && members.find((m) => m.name === value)
      ? optionKey(members.find((m) => m.name === value)!)
      : value
        ? `manuel:${value}`
        : '';

  return (
    <Select
      value={currentKey}
      disabled={disabled}
      onChange={(e) => {
        const key = e.target.value;
        if (!key) {
          onChange('', null);
          return;
        }
        if (key.startsWith('manuel:')) {
          onChange(key.slice('manuel:'.length), null);
          return;
        }
        const member = members.find((m) => optionKey(m) === key) ?? null;
        onChange(member?.name ?? '', member);
      }}
    >
      {allowUnassigned && <option value="">— Non affecté —</option>}
      {members.map((m) => (
        <option key={optionKey(m)} value={optionKey(m)}>
          {m.name}
          {m.role ? ` (${ROLE_SHORT[m.role] ?? m.role})` : ''}
          {m.fromOrg ? (m.email ? ` — ${m.email}` : '') : ' — profil local'}
        </option>
      ))}
      {value && !members.some((m) => m.name === value) && (
        <option value={`manuel:${value}`}>{value} (saisi manuellement)</option>
      )}
    </Select>
  );
}
