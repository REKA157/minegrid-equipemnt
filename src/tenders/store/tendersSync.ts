/**
 * Synchronisation de l'espace de travail Appels d'offres avec Supabase.
 *
 * OPT-IN et NON-CASSANT : si le partage n'est pas configuré (VITE_TENDERS_SHARED)
 * ou si l'utilisateur n'est pas connecté à une société, ce hook ne fait
 * strictement rien — le module reste 100 % local comme avant.
 *
 * Quand une société valide est chargée (mode 'shared') :
 *  1. Au montage : hydrate le store avec l'espace de la société (les données
 *     de la société remplacent le cache local).
 *  2. À chaque modification : ré-enregistre l'espace (débounce 1,5 s).
 *
 * SÉCURITÉ ANTI-PERTE (findings revue) : la sauvegarde n'est ARMÉE
 * (`ready`) QU'APRÈS une hydratation partagée réussie. En mode 'local' ou
 * 'error' (auth pas prête, RPC en échec, pas de société), on n'écrit JAMAIS
 * — impossible pour le cache local/démo d'écraser l'espace d'une société.
 *
 * LIMITE v1 : dernière écriture gagnante au niveau société (cf. migration) ;
 * et l'org est résolue owner-prioritaire côté serveur (un utilisateur qui
 * possède sa propre org ET est invité dans une autre société est rattaché à
 * la sienne — à faire évoluer vers un sélecteur de société explicite).
 */

import { useEffect, useRef, useState } from 'react';
import type {
  GeneratedDocument,
  LibraryItem,
  Tender,
  CompanyProfile,
  RoleAssignment,
} from '../types';
import { useTendersStore } from './tendersStore';
import {
  getCurrentUserId,
  isTendersSharedConfigured,
  loadWorkspace,
  saveWorkspace,
} from '../../utils/api/tendersWorkspace';

export type SyncStatus = 'local' | 'chargement' | 'partage' | 'erreur';

export function useTendersSync(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(
    isTendersSharedConfigured() ? 'chargement' : 'local',
  );
  const hydrating = useRef(false);
  // `ready` = la sauvegarde est armée. UNIQUEMENT après une hydratation
  // partagée réussie : garantit qu'on n'écrit jamais par erreur.
  const ready = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Chargement au montage.
  useEffect(() => {
    if (!isTendersSharedConfigured()) return;
    let cancelled = false;
    (async () => {
      const res = await loadWorkspace();
      if (cancelled) return;

      if (res.mode === 'shared') {
        const ws = res.data;
        // Renseigne l'identité de compte (pour « Mes affectations »).
        const userId = await getCurrentUserId();
        const roleAssignments = (ws.roleAssignments as RoleAssignment[] | undefined) ?? [];
        // HÉRITAGE DU RÔLE : si l'admin a attribué un rôle à mon compte, je
        // l'applique automatiquement (mes droits reflètent ce que l'admin a
        // décidé). Sinon, on garde le rôle courant (défaut admin en local).
        const mine = userId
          ? roleAssignments.find((a) => a.memberId === userId)
          : undefined;
        hydrating.current = true;
        useTendersStore.setState((s) => ({
          seeded: true, // pas de démo en mode partagé
          tenders: (ws.tenders as Tender[] | undefined) ?? [],
          documents: (ws.documents as GeneratedDocument[] | undefined) ?? [],
          library: (ws.library as LibraryItem[] | undefined) ?? s.library,
          company: (ws.company as CompanyProfile | undefined) ?? s.company,
          roleAssignments,
          settings: {
            ...s.settings,
            ...(userId ? { currentUserId: userId } : {}),
            ...(mine ? { currentUserRole: mine.role } : {}),
          },
        }));
        hydrating.current = false;
        ready.current = true; // ARME la sauvegarde seulement maintenant
        setStatus('partage');
      } else {
        // 'local' (pas de société / pas connecté) OU 'error' (transitoire) :
        // on NE touche PAS au store et on N'ARME PAS la sauvegarde.
        setStatus(res.mode === 'error' ? 'erreur' : 'local');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Sauvegarde à chaque changement (débounce) — seulement si armée.
  useEffect(() => {
    if (!isTendersSharedConfigured()) return;
    const unsub = useTendersStore.subscribe((state) => {
      if (hydrating.current || !ready.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const ok = await saveWorkspace({
          tenders: state.tenders,
          documents: state.documents,
          library: state.library,
          company: state.company,
          roleAssignments: state.roleAssignments,
        });
        setStatus(ok ? 'partage' : 'erreur');
      }, 1500);
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return status;
}
