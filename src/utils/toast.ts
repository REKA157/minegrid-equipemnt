import { notificationService } from '../services/notificationService';

/**
 * Helper drop-in pour remplacer les `alert(msg)` du code legacy.
 *
 * Heuristique d'inference du type : si le message contient un mot-cle
 * d'erreur (erreur, error, echec, echoue, impossible, invalid...) on
 * emet une notification `error`, sinon un `success`. Les appels qui
 * veulent un controle fin doivent utiliser directement
 * `notificationService.{success,error,warning,info}`.
 *
 * L'API expose a la fois :
 *   - `toast(msg)`               : usage rapide
 *   - `toast(msg, 'success')`    : forcer un type
 *   - `toast.success(msg)` etc.  : style "sonner/react-hot-toast"
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

const ERROR_HINTS = [
  'erreur',
  'error',
  'echec',
  'echoue',
  'impossible',
  'invalid',
  'incorrect',
  'introuvable',
  'non autorise',
  'refuse',
  'required',
  'obligatoire',
];

/** Marqueurs d'une réussite RÉELLEMENT voulue par l'appelant. */
const SUCCESS_HINTS = ['✅', 'succès', 'succes', 'confirmé', 'confirme', 'activé', 'active !', 'enregistré'];

/**
 * Type déduit du texte — en dernier recours seulement.
 *
 * RÈGLE : on ne déduit JAMAIS « succès ». Un message inconnu devient `info`.
 *
 * Pourquoi : le 2026-08-13, un refus de changement de formule (« Nous n'avons
 * pas pu modifier votre formule… ») s'est affiché sous un bandeau VERT intitulé
 * « Succès », faute de contenir l'un des mots-clés d'erreur. Annoncer une
 * réussite là où il y a un échec est le pire des deux sens : l'utilisateur croit
 * son changement fait. Un `info` neutre, lui, ne ment jamais.
 *
 * Les appels qui savent — c'est-à-dire presque tous — doivent utiliser
 * `toast.success()` / `toast.error()` et ne rien laisser deviner.
 */
function inferType(message: string): ToastType {
  const lower = message.toLowerCase();
  if (ERROR_HINTS.some((h) => lower.includes(h))) return 'error';
  if (SUCCESS_HINTS.some((h) => lower.includes(h))) return 'success';
  return 'info';
}

type ToastFn = {
  (message: string, type?: ToastType): void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const toastImpl = (message: string, type?: ToastType) => {
  const resolved = type ?? inferType(message);
  const defaultTitle: Record<ToastType, string> = {
    success: 'Succes',
    error: 'Erreur',
    warning: 'Attention',
    info: 'Information',
  };
  notificationService[resolved](defaultTitle[resolved], message);
};

export const toast: ToastFn = Object.assign(toastImpl, {
  success: (m: string, t = 'Succes') => notificationService.success(t, m),
  error: (m: string, t = 'Erreur') => notificationService.error(t, m),
  warning: (m: string, t = 'Attention') => notificationService.warning(t, m),
  info: (m: string, t = 'Information') => notificationService.info(t, m),
});

export default toast;
