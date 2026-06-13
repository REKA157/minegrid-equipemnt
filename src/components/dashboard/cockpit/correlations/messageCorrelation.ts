import type { CockpitSignal } from '../buildVendeurCockpit';

/**
 * CORRÉLATION M12 — messages → prochaine action.
 *
 * Surface les messages reçus NON LUS (table `messages`, RLS receiver/seller) comme
 * action prioritaire « répondre ». Anti-façade : aucune carte si aucun non-lu.
 *
 * NB : emails / WhatsApp ne sont pas des canaux ENTRANTS distincts dans la
 * plateforme aujourd'hui (seul l'envoi sortant existe via communicationService) ;
 * M12 couvre donc le canal réel disponible — la messagerie interne.
 */
export function buildMessageSignals(messages: Array<{ is_read?: boolean | null }>): {
  priorities: CockpitSignal[];
} {
  const unread = messages.filter((m) => !m?.is_read);
  if (!unread.length) return { priorities: [] };
  return {
    priorities: [
      {
        id: 'corr:messages-unread',
        label: `${unread.length} message(s) non lu(s) à traiter`,
        detail: 'Répondre vite augmente la conversion',
        href: '#messages',
        tone: unread.length >= 5 ? 'urgent' : 'warn',
      },
    ],
  };
}
