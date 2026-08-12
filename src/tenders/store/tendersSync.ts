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
import { defaultTenderRole } from '../types';
import { useTendersStore } from './tendersStore';
import {
  getCurrentUserId,
  isTendersSharedConfigured,
  loadWorkspace,
  saveWorkspace,
} from '../../utils/api/tendersWorkspace';
import { getMyMemberScope } from '../../utils/api/memberScope';

// 'conflit' (MG-M07) : un autre membre a modifie l'espace entre notre lecture
// et notre ecriture. L'interface doit proposer un rechargement plutot que
// d'ecraser silencieusement.
export type SyncStatus = 'local' | 'chargement' | 'partage' | 'erreur' | 'conflit';

export function useTendersSync(): SyncStatus {
  // Version de l'espace partage telle que ce client l'a lue (MG-M07).
  const currentVersion = useRef<number | null>(null);
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
    // Photographie des dossiers présents AU MONTAGE : tout dossier apparu
    // pendant le chargement (création terminée avant la fin de la RPC) sera
    // GREFFÉ à l'hydratation au lieu d'être écrasé.
    const idsAtMount = new Set(useTendersStore.getState().tenders.map((t) => t.id));
    (async () => {
      const res = await loadWorkspace();
      if (cancelled) return;

      if (res.mode === 'shared') {
        const ws = res.data;
        // Renseigne l'identité de compte (pour « Mes affectations »).
        const userId = await getCurrentUserId();
        // Rôle SOCIÉTÉ réel (owner/admin/manager/viewer) pour dériver le rôle AO
        // par défaut — jamais « admin » auto-déclaré.
        const scope = await getMyMemberScope();
        const societeRole = scope.role ?? null;
        const roleAssignments = (ws.roleAssignments as RoleAssignment[] | undefined) ?? [];
        // HÉRITAGE DU RÔLE : si l'admin a attribué un rôle à mon compte, je
        // l'applique ; SINON je dérive du rôle société (moindre privilège :
        // manager→rédacteur, viewer→lecteur, owner/admin→admin). Plus jamais
        // « admin » par défaut pour un membre non désigné.
        const mine = userId
          ? roleAssignments.find((a) => a.memberId === userId)
          : undefined;
        const server = (ws.tenders as Tender[] | undefined) ?? [];
        const serverIds = new Set(server.map((t) => t.id));
        let mergedDuringLoad = false;
        hydrating.current = true;
        useTendersStore.setState((s) => {
          // Course rare : dossier créé pendant le vol de loadWorkspace. Le
          // cache local PRÉ-existant reste exclu (anti-pollution société).
          const createdDuringLoad = s.tenders.filter(
            (t) => !idsAtMount.has(t.id) && !serverIds.has(t.id),
          );
          mergedDuringLoad = createdDuringLoad.length > 0;
          return {
            seeded: true, // pas de démo en mode partagé
            tenders: [...createdDuringLoad, ...server],
            documents: (ws.documents as GeneratedDocument[] | undefined) ?? [],
            library: (ws.library as LibraryItem[] | undefined) ?? s.library,
            company: (ws.company as CompanyProfile | undefined) ?? s.company,
            roleAssignments,
            settings: {
              ...s.settings,
              ...(userId ? { currentUserId: userId } : {}),
              // Signe les actions/décisions du vrai nom (attribué par l'admin)
              // au lieu du « Utilisateur » par défaut.
              ...(mine?.name ? { currentUserName: mine.name } : {}),
              // Échec TRANSITOIRE de la détection du rôle société (roleKnown
              // false) : on garde le rôle courant plutôt que de rétrograder
              // silencieusement un propriétaire en « lecteur ».
              currentUserRole:
                mine?.role ??
                (scope.roleKnown !== false
                  ? defaultTenderRole(societeRole)
                  : s.settings.currentUserRole),
            },
          };
        });
        hydrating.current = false;
        ready.current = true; // ARME la sauvegarde seulement maintenant
        if (mergedDuringLoad) {
          // Écrit immédiatement le dossier greffé côté société.
          const s = useTendersStore.getState();
          void saveWorkspace({
            tenders: s.tenders,
            documents: s.documents,
            library: s.library,
            company: s.company,
            roleAssignments: s.roleAssignments,
          });
        }
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

    const buildPayload = () => {
      const s = useTendersStore.getState();
      return {
        tenders: s.tenders,
        documents: s.documents,
        library: s.library,
        company: s.company,
        roleAssignments: s.roleAssignments,
      };
    };

    // FLUSH : envoie immédiatement une sauvegarde EN ATTENTE (démontage du
    // module ou fermeture d'onglet). Sans lui, l'édition des 1,5 dernières
    // secondes n'était jamais écrite côté société et disparaissait à la
    // prochaine hydratation.
    const flushPending = () => {
      if (!saveTimer.current || !ready.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void saveWorkspace(buildPayload());
    };

    const unsub = useTendersStore.subscribe(() => {
      if (hydrating.current || !ready.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = null; // plus rien en attente
        // MG-M07 — saveWorkspace renvoie desormais un resultat detaille.
        // Un conflit de version signifie qu'un autre membre a modifie l'espace :
        // on NE reessaie PAS en ecrasant, on signale. Ecraser reproduirait
        // exactement la perte de donnees que le verrou corrige.
        const res = await saveWorkspace(buildPayload(), currentVersion.current ?? undefined);
        if (res.ok) {
          currentVersion.current = res.version;
          setStatus('partage');
        } else if (res.reason === 'version_conflict') {
          currentVersion.current = res.currentVersion;
          setStatus('conflit');
        } else {
          setStatus('erreur');
        }
      }, 1500);
    });

    // Meilleur effort à la fermeture d'onglet (non garanti par le navigateur,
    // mais couvre la grande majorité des cas).
    window.addEventListener('pagehide', flushPending);
    return () => {
      unsub();
      window.removeEventListener('pagehide', flushPending);
      flushPending();
    };
  }, []);

  return status;
}
