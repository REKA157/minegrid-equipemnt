/**
 * Synchronisation de l'espace de travail Appels d'offres avec Supabase.
 *
 * OPT-IN et NON-CASSANT : si le partage n'est pas configuré (VITE_TENDERS_SHARED)
 * ou si l'utilisateur n'est pas connecté à une société, ce hook ne fait
 * strictement rien — le module reste 100 % local comme avant.
 *
 * Quand le partage est actif :
 *  1. Au montage : charge l'espace de travail de la société et hydrate le
 *     store (les données de la société remplacent le cache local).
 *  2. À chaque modification : ré-enregistre l'espace (débounce 1,5 s).
 *
 * Le localStorage (middleware persist) sert de cache/offline ; la source de
 * vérité en mode partagé est Supabase, rechargée au montage.
 *
 * LIMITE v1 : dernière écriture gagnante au niveau société (cf. migration).
 */

import { useEffect, useRef, useState } from 'react';
import type { GeneratedDocument, LibraryItem, Tender, CompanyProfile } from '../types';
import { useTendersStore } from './tendersStore';
import {
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
  const ready = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Chargement au montage.
  useEffect(() => {
    if (!isTendersSharedConfigured()) return;
    let cancelled = false;
    (async () => {
      const ws = await loadWorkspace();
      if (cancelled) return;
      if (ws) {
        hydrating.current = true;
        useTendersStore.setState((s) => ({
          seeded: true, // ne pas injecter la démo en mode partagé
          tenders: (ws.tenders as Tender[] | undefined) ?? [],
          documents: (ws.documents as GeneratedDocument[] | undefined) ?? [],
          library: (ws.library as LibraryItem[] | undefined) ?? s.library,
          company: (ws.company as CompanyProfile | undefined) ?? s.company,
        }));
        hydrating.current = false;
        setStatus('partage');
      } else {
        // Partage demandé mais indisponible (pas connecté / pas de société /
        // société sans espace encore créé) : on reste en local, sans démo écrasée.
        setStatus('local');
      }
      ready.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Sauvegarde à chaque changement (débounce).
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
        });
        setStatus(ok ? 'partage' : 'local');
      }, 1500);
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return status;
}
