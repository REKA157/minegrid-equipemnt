import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  listContactMessages,
  setContactStatus,
  type MessageContact,
  type StatutMessage,
} from '../../utils/api/platformAdmin';
import { toast } from '../../utils/toast';

/**
 * Boîte de réception du formulaire de contact.
 *
 * Ces messages arrivaient en base depuis des mois sans qu'aucun écran ne les
 * lise : des demandes commerciales perdues, sans même la trace du manque à
 * gagner. C'est l'écran qui répare ça.
 *
 * Le message est affiché EN ENTIER, pas tronqué : un extrait obligerait à
 * ouvrir une fiche pour chaque ligne, et on ne classerait plus rien.
 */

const FILTRES: { cle: StatutMessage | 'tous'; libelle: string }[] = [
  { cle: 'new', libelle: 'Non lus' },
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'replied', libelle: 'Répondus' },
  { cle: 'archived', libelle: 'Archivés' },
];

const LIBELLE_STATUT: Record<StatutMessage, string> = {
  new: 'Non lu',
  read: 'Lu',
  replied: 'Répondu',
  archived: 'Archivé',
};

function formaterHorodatage(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminContact() {
  const [messages, setMessages] = useState<MessageContact[]>([]);
  const [filtre, setFiltre] = useState<StatutMessage | 'tous'>('new');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      setMessages(await listContactMessages(filtre, 200));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [filtre]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const classer = async (m: MessageContact, statut: StatutMessage) => {
    setEnCours(true);
    try {
      await setContactStatus(m.id, statut);
      toast.success(`Message de ${m.nom} : ${LIBELLE_STATUT[statut].toLowerCase()}.`);
      await recharger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Le classement a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTRES.map((f) => (
          <button
            key={f.cle}
            onClick={() => setFiltre(f.cle)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filtre === f.cle
                ? 'border-orange-600 text-orange-700 bg-orange-50'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.libelle}
          </button>
        ))}
      </div>

      {erreur && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-gray-300 bg-gray-50 p-3">
          <AlertTriangle className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">{erreur}</p>
        </div>
      )}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-500 py-8">Aucun message dans cette catégorie.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <article
              key={m.id}
              className={`rounded-md border p-4 ${
                m.statut === 'new' ? 'border-orange-300 bg-orange-50/40' : 'border-gray-200'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">{m.sujet}</h3>
                <span className="text-xs text-gray-500">{formaterHorodatage(m.date)}</span>
              </div>

              <p className="text-sm text-gray-600 mb-3">
                {m.nom}
                {m.societe ? ` — ${m.societe}` : ''} ·{' '}
                <a href={`mailto:${m.email}`} className="text-orange-700 hover:underline">
                  {m.email}
                </a>
                {m.service ? ` · ${m.service}` : ''}
              </p>

              <p className="text-sm text-gray-800 whitespace-pre-wrap mb-3">{m.message}</p>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-gray-500">{LIBELLE_STATUT[m.statut]}</span>
                <span className="text-gray-300">|</span>
                {m.statut !== 'read' && (
                  <button
                    onClick={() => void classer(m, 'read')}
                    disabled={enCours}
                    className="text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
                  >
                    Marquer lu
                  </button>
                )}
                {m.statut !== 'replied' && (
                  <button
                    onClick={() => void classer(m, 'replied')}
                    disabled={enCours}
                    className="text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
                  >
                    Marquer répondu
                  </button>
                )}
                {m.statut !== 'archived' && (
                  <button
                    onClick={() => void classer(m, 'archived')}
                    disabled={enCours}
                    className="text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
                  >
                    Archiver
                  </button>
                )}
                {/* Répondre se fait dans le client mail : la plateforme n'envoie
                    pas d'e-mail au nom de l'équipe, et ne prétend pas le faire. */}
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent('Re : ' + m.sujet)}`}
                  className="ml-auto font-medium text-orange-700 hover:underline"
                >
                  Répondre par e-mail
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
