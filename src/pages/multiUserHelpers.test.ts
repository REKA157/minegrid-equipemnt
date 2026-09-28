/**
 * Logique d'affichage de la gestion d'équipe, jamais testée tant qu'elle vivait
 * dans les 1 228 lignes de MultiUserManagement.tsx.
 *
 * Le point sensible : `orgMemberToTeamMember` traduit un rôle en liste de
 * permissions AFFICHÉES. Les permissions réelles sont posées par la RLS côté
 * base. Si les deux divergent, l'écran ment à l'utilisateur sur ce qu'il a le
 * droit de faire — ces cas figent donc la correspondance.
 */

import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS_BY_ROLE,
  orgMemberToTeamMember,
  fmtDateTime,
  fmtDuration,
  shortDevice,
} from './multiUserHelpers';

const membre = (p: Record<string, unknown> = {}) =>
  ({
    user_id: 'u-1',
    email: 'karim@exemple.ma',
    first_name: 'Karim',
    last_name: 'Bennani',
    role: 'manager',
    last_sign_in_at: null,
    ...p,
  }) as never;

describe('PERMISSIONS_BY_ROLE', () => {
  it('donne tout à owner et admin, rien qu’un tableau de bord à viewer', () => {
    expect(PERMISSIONS_BY_ROLE.owner).toEqual(['all']);
    expect(PERMISSIONS_BY_ROLE.admin).toEqual(['all']);
    expect(PERMISSIONS_BY_ROLE.viewer).toEqual(['dashboard']);
  });

  it('n’accorde PAS « all » à manager', () => {
    // Un manager qui verrait « toutes permissions » à l'écran croirait pouvoir
    // agir là où la base le refusera.
    expect(PERMISSIONS_BY_ROLE.manager).not.toContain('all');
    expect(PERMISSIONS_BY_ROLE.manager).toEqual(['dashboard', 'machines', 'orders', 'analytics']);
  });
});

describe('orgMemberToTeamMember', () => {
  it('compose le nom complet et des initiales en majuscules', () => {
    const t = orgMemberToTeamMember(membre());
    expect(t.name).toBe('Karim Bennani');
    expect(t.avatar).toBe('KB');
  });

  it('retombe sur le courriel quand le nom manque', () => {
    const t = orgMemberToTeamMember(membre({ first_name: null, last_name: null }));
    expect(t.name).toBe('karim@exemple.ma');
    expect(t.avatar).toBe('KA');
  });

  it('n’affiche jamais « undefined » sur un membre sans nom ni courriel', () => {
    const t = orgMemberToTeamMember(membre({ first_name: null, last_name: null, email: null }));
    expect(t.name).toBe('Membre');
    expect(t.email).toBe('');
    expect(t.name).not.toContain('undefined');
  });

  it('ne garde que deux initiales sur un nom long', () => {
    const t = orgMemberToTeamMember(membre({ first_name: 'Ali Ben', last_name: 'El Amrani' }));
    expect(t.avatar).toHaveLength(2);
  });

  it('dit « Jamais connecté » plutôt que d’afficher une date vide', () => {
    expect(orgMemberToTeamMember(membre()).lastLogin).toBe('Jamais connecté');
  });

  it('marque actif tout membre présent : y être, c’est avoir accepté', () => {
    // Les invitations en attente vivent dans user_invitations, pas ici.
    expect(orgMemberToTeamMember(membre()).status).toBe('active');
  });

  it('retombe sur « dashboard » pour un rôle inconnu de la table', () => {
    // Un rôle ajouté en base sans mise à jour du front ne doit PAS ouvrir
    // l'écran en grand : le repli est le plus restrictif.
    const t = orgMemberToTeamMember(membre({ role: 'auditeur' }));
    expect(t.permissions).toEqual(['dashboard']);
  });

  it('reporte les permissions du rôle', () => {
    expect(orgMemberToTeamMember(membre({ role: 'owner' })).permissions).toEqual(['all']);
  });
});

describe('fmtDateTime', () => {
  it('met un tiret plutôt qu’une date vide', () => {
    expect(fmtDateTime(null)).toBe('—');
  });

  it('formate en jour/mois/année heure:minute', () => {
    const r = fmtDateTime('2026-07-09T14:32:00Z');
    expect(r).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(r).toMatch(/\d{2}:\d{2}/);
  });
});

describe('fmtDuration', () => {
  it('arrondit à la minute, puis passe en heures', () => {
    expect(fmtDuration('2026-07-09T10:00:00Z', '2026-07-09T10:45:00Z')).toBe('45 min');
    expect(fmtDuration('2026-07-09T10:00:00Z', '2026-07-09T12:00:00Z')).toBe('2 h');
    expect(fmtDuration('2026-07-09T10:00:00Z', '2026-07-09T12:30:00Z')).toBe('2 h 30 min');
  });

  it('dit « moins d’une minute » plutôt que « 0 min »', () => {
    expect(fmtDuration('2026-07-09T10:00:00Z', '2026-07-09T10:00:20Z')).toBe(
      "moins d'une minute",
    );
  });

  it('refuse une durée négative ou illisible', () => {
    // Une déconnexion antérieure à la connexion existe en base (horloges
    // décalées) : afficher « -3 h » serait pire que de ne rien afficher.
    expect(fmtDuration('2026-07-09T12:00:00Z', '2026-07-09T10:00:00Z')).toBe('—');
    expect(fmtDuration('pas une date', '2026-07-09T10:00:00Z')).toBe('—');
  });
});

describe('shortDevice', () => {
  it('reconnaît les couples navigateur · système courants', () => {
    expect(shortDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe(
      'Chrome · Windows',
    );
    expect(shortDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604')).toBe(
      'Safari · iOS',
    );
  });

  it('distingue Edge et Opera de Chrome, dont ils portent la signature', () => {
    // Les deux annoncent « Chrome/... » : sans test d'ordre, tout devient Chrome.
    expect(shortDevice('Windows NT 10.0 Chrome/120 Edg/120')).toBe('Edge · Windows');
    expect(shortDevice('Windows NT 10.0 Chrome/120 OPR/106')).toBe('Opera · Windows');
  });

  it('dit « Appareil inconnu » plutôt que de laisser un vide', () => {
    expect(shortDevice(null)).toBe('Appareil inconnu');
    expect(shortDevice('curl/8.0')).toBe('Appareil inconnu');
  });
});
