import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { listRecentActions, type ActionJournal } from '../../utils/api/platformAdmin';

/**
 * Le journal d'administration — en lecture seule, par construction.
 *
 * Aucun bouton n'y touche, et ce n'est pas une politesse : la base refuse toute
 * modification, toute suppression et tout vidage de cette table, y compris au
 * propriétaire et à la clé de service (verrou p26, prouvé en contre-cas).
 */

const LIBELLE_ACTION: Record<string, string> = {
  'admin.grant': 'Nomination d’un administrateur',
  'admin.revoke': 'Retrait d’un administrateur',
  'client.consultation': 'Consultation d’une fiche client',
  'abonnement.prolongation': 'Prolongation d’abonnement',
  'abonnement.changement_palier': 'Changement de palier',
  'abonnement.suspension': 'Suspension d’accès',
  'abonnement.reactivation': 'Réactivation d’accès',
  'abonnement.desactivation': 'Désactivation d’accès',
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

export default function AdminJournal() {
  const [lignes, setLignes] = useState<ActionJournal[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    listRecentActions(100)
      .then((l) => {
        if (vivant) setLignes(l);
      })
      .catch((e) => {
        if (vivant) setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (vivant) setChargement(false);
      });
    return () => {
      vivant = false;
    };
  }, []);

  if (chargement) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-gray-300 bg-gray-50 p-3">
        <AlertTriangle className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700">{erreur}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Les 100 derniers gestes d'administration. Cette table ne peut être ni modifiée ni effacée —
        pas même depuis l'outil d'administration de la base.
      </p>

      {lignes.length === 0 ? (
        <p className="text-sm text-gray-500 py-6">Aucun geste enregistré pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Quand</th>
                <th className="px-3 py-2 font-medium">Qui</th>
                <th className="px-3 py-2 font-medium">Quoi</th>
                <th className="px-3 py-2 font-medium">Motif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map((l, i) => (
                <tr key={`${l.date}-${i}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {formaterHorodatage(l.date)}
                  </td>
                  <td className="px-3 py-2">{l.acteur}</td>
                  <td className="px-3 py-2">{LIBELLE_ACTION[l.action] ?? l.action}</td>
                  <td className="px-3 py-2 text-gray-700">{l.motif}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
