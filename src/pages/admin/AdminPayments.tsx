import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  listPayments,
  getPaymentStats,
  type Paiement,
  type StatsPaiements,
} from '../../utils/api/platformAdmin';
import { planDisplayName } from '../../config/plans';

/**
 * Registre des encaissements d'abonnement.
 *
 * DEUX RÈGLES DE VÉRITÉ, qui viennent de pièges réels :
 *
 *  1. Les montants arrivent EN CENTIMES (20 $ = 2000). La conversion se fait
 *     ici, à un seul endroit, dans `formaterMontant`. C'est le piège qui aurait
 *     affiché un chiffre d'affaires cent fois trop grand.
 *  2. Si plusieurs devises coexistent, on N'ADDITIONNE PAS : additionner des
 *     dollars et des euros produit un nombre qui ne veut rien dire. L'écran
 *     affiche alors les paiements sans total, et le dit.
 *
 * Ce registre ne contient que ce que le webhook y a écrit depuis sa mise en
 * place : il ne reconstitue pas le passé, et l'écran l'annonce plutôt que de
 * laisser croire à un historique complet.
 */

function formaterMontant(centimes: number | null, devise: string): string {
  if (centimes === null) return '—';
  return `${(centimes / 100).toFixed(2)} ${devise}`;
}

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

export default function AdminPayments() {
  const [lignes, setLignes] = useState<Paiement[]>([]);
  const [stats, setStats] = useState<StatsPaiements | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    Promise.all([listPayments(200), getPaymentStats()])
      .then(([l, s]) => {
        if (!vivant) return;
        setLignes(l);
        setStats(s);
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

  const plusieursDevises = Boolean(stats && stats.devises.includes(','));

  return (
    <div>
      {stats && (
        <>
          {plusieursDevises ? (
            <div className="mb-6 rounded-md border border-gray-300 bg-gray-50 p-3">
              <p className="text-sm text-gray-700">
                Plusieurs devises sont présentes ({stats.devises}). Aucun total n'est affiché :
                additionner des montants de devises différentes donnerait un chiffre faux.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Compteur
                valeur={formaterMontant(stats.moisCentimes, stats.devises)}
                libelle="Encaissé ce mois-ci"
              />
              <Compteur valeur={String(stats.moisNombre)} libelle="Paiements ce mois-ci" />
              <Compteur
                valeur={formaterMontant(stats.totalCentimes, stats.devises)}
                libelle="Total enregistré"
                precision="depuis la mise en place du registre"
              />
              <Compteur valeur={String(stats.totalNombre)} libelle="Paiements au total" />
            </div>
          )}
        </>
      )}

      {lignes.length === 0 ? (
        <div className="rounded-md border border-gray-200 p-6">
          <p className="text-sm text-gray-700 mb-1">Aucun encaissement enregistré.</p>
          <p className="text-sm text-gray-500">
            C'est attendu tant que le compte Paddle « live » n'existe pas : aucun paiement réel n'est
            possible. Le registre se remplira tout seul, à partir du premier.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Palier</th>
                <th className="px-3 py-2 font-medium">Montant</th>
                <th className="px-3 py-2 font-medium">Référence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map((p, i) => (
                <tr key={`${p.reference}-${i}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {formaterHorodatage(p.date)}
                  </td>
                  <td className="px-3 py-2">{p.email}</td>
                  <td className="px-3 py-2">{p.plan ? planDisplayName(p.plan) : '—'}</td>
                  <td className="px-3 py-2 font-medium">
                    {formaterMontant(p.montantCentimes, p.devise)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">
                    {p.reference ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        Ce registre est en écriture seule : une ligne ne peut être ni modifiée ni supprimée, pas même
        depuis l'outil d'administration de la base.
      </p>
    </div>
  );
}

function Compteur({
  valeur,
  libelle,
  precision,
}: {
  valeur: string;
  libelle: string;
  precision?: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="text-xl font-bold text-gray-900">{valeur}</div>
      <div className="text-sm text-gray-700">{libelle}</div>
      {precision && <div className="text-xs text-gray-500 mt-0.5">{precision}</div>}
    </div>
  );
}
