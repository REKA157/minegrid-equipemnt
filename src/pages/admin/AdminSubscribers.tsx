import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, AlertTriangle } from 'lucide-react';
import {
  listSubscribers,
  getSubscriberStats,
  extendSubscription,
  changePlan,
  setSubscriptionStatus,
  type Subscriber,
  type SubscriberStats,
  type FiltreAbonnes,
  type ResultatGeste,
} from '../../utils/api/platformAdmin';
import { planDisplayName } from '../../config/plans';
import { toast } from '../../utils/toast';

/**
 * Écran « Abonnés » — celui qu'on ouvre dix fois par jour.
 *
 * TROIS RÈGLES D'AFFICHAGE, qui viennent de pièges réels :
 *
 *  1. Le palier passe TOUJOURS par `planDisplayName()`. Les codes internes sont
 *     croisés ('pro' se dit « Premium » 20 $, 'premium' se dit « Pro » 50 $) :
 *     écrire le code brut inverserait le tableau.
 *  2. L'état affiché est `actif` (statut ET date), jamais le statut brut : rien
 *     ne balaye les abonnements expirés, qui restent marqués « active ».
 *  3. Aucun total d'argent n'est calculé ici. `payment_amount` n'est pas une
 *     source fiable de chiffre d'affaires ; afficher un total faux serait pire
 *     que ne rien afficher.
 */

const FILTRES: { cle: FiltreAbonnes; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'actifs', libelle: 'Actifs' },
  { cle: 'expirent', libelle: 'Expirent sous 7 jours' },
  { cle: 'inactifs', libelle: 'Inactifs ou expirés' },
];

function formaterDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/** Demande un motif. Renvoie null si l'utilisateur renonce. */
function demanderMotif(question: string): string | null {
  const saisie = window.prompt(`${question}\n\nMotif (obligatoire, consigné au journal) :`);
  if (saisie === null) return null;
  if (!saisie.trim()) {
    toast.info('Un motif écrit est obligatoire.');
    return null;
  }
  return saisie.trim();
}

export default function AdminSubscribers() {
  const [lignes, setLignes] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<SubscriberStats | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreAbonnes>('tous');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      const [l, s] = await Promise.all([
        listSubscribers(recherche, filtre, 200),
        getSubscriberStats(),
      ]);
      setLignes(l);
      setStats(s);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [recherche, filtre]);

  useEffect(() => {
    void recharger();
  }, [filtre]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Après un geste : avertir si Paddle reprendra la main, puis recharger. */
  const apresGeste = async (r: ResultatGeste, message: string) => {
    toast.success(message);
    if (r.factureParPaddle) {
      toast.info(
        "Ce compte est facturé automatiquement par Paddle : la retouche sera écrasée au prochain " +
          'renouvellement. Pour un geste durable, passez par un code promo ou modifiez l’abonnement chez Paddle.',
      );
    }
    await recharger();
  };

  const prolonger = async (s: Subscriber) => {
    const saisie = window.prompt(`Prolonger l'accès de ${s.email} de combien de jours ?`, '30');
    if (saisie === null) return;
    const jours = Number(saisie);
    if (!Number.isFinite(jours) || jours <= 0 || jours > 365) {
      toast.info('Indiquez un nombre de jours entre 1 et 365.');
      return;
    }
    const motif = demanderMotif(`Prolonger ${s.email} de ${jours} jours`);
    if (!motif) return;
    setEnCours(true);
    try {
      const r = await extendSubscription(s.userId, jours, motif);
      await apresGeste(r, `Accès de ${s.email} prolongé de ${jours} jours.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La prolongation a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const changerPalier = async (s: Subscriber) => {
    const saisie = window.prompt(
      `Nouveau palier pour ${s.email} ?\n\n` +
        "Tapez le code interne :\n" +
        "  pro         -> affiché « Premium » (20 USD)\n" +
        "  premium     -> affiché « Pro » (50 USD)\n" +
        "  enterprise  -> affiché « Enterprise » (200 USD)\n\n" +
        '(Oui, les deux premiers sont croisés en base — c’est historique.)',
      s.type,
    );
    if (saisie === null) return;
    const plan = saisie.trim().toLowerCase();
    if (!['pro', 'premium', 'enterprise'].includes(plan)) {
      toast.info('Palier inconnu : pro, premium ou enterprise.');
      return;
    }
    const motif = demanderMotif(`Passer ${s.email} en ${planDisplayName(plan)}`);
    if (!motif) return;
    setEnCours(true);
    try {
      const r = await changePlan(s.userId, plan, motif);
      await apresGeste(r, `${s.email} est désormais en ${planDisplayName(plan)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Le changement de palier a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const changerStatut = async (s: Subscriber, statut: 'suspended' | 'active') => {
    const verbe = statut === 'suspended' ? 'Suspendre' : 'Réactiver';
    const motif = demanderMotif(`${verbe} l'accès de ${s.email}`);
    if (!motif) return;
    setEnCours(true);
    try {
      const r = await setSubscriptionStatus(s.userId, statut, motif);
      await apresGeste(r, `Accès de ${s.email} ${statut === 'suspended' ? 'suspendu' : 'réactivé'}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'opération a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Compteur valeur={stats.actifs} libelle="Abonnés actifs" precision="statut ET échéance" />
          <Compteur valeur={stats.expirent7j} libelle="Expirent sous 7 jours" />
          <Compteur valeur={stats.nouveaux30j} libelle="Nouveaux (30 jours)" />
          <Compteur
            valeur={stats.sansPaiement}
            libelle="Actifs sans paiement"
            precision="offerts, codes promo, activations manuelles"
          />
        </div>
      )}

      {stats && Object.keys(stats.parPalier).length > 0 && (
        <p className="text-sm text-gray-600 mb-6">
          Répartition :{' '}
          {Object.entries(stats.parPalier)
            .map(([code, n]) => `${n} × ${planDisplayName(code)}`)
            .join(' · ')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void recharger();
            }}
            placeholder="Rechercher par e-mail ou société…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <button
          onClick={() => void recharger()}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Rechercher
        </button>
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as FiltreAbonnes)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {FILTRES.map((f) => (
            <option key={f.cle} value={f.cle}>
              {f.libelle}
            </option>
          ))}
        </select>
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
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Palier</th>
                <th className="px-3 py-2 font-medium">Échéance</th>
                <th className="px-3 py-2 font-medium">Sièges</th>
                <th className="px-3 py-2 font-medium">Paiement</th>
                <th className="px-3 py-2 font-medium">État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map((s) => (
                <tr key={s.userId} className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{s.companyName || '—'}</div>
                    <div className="text-gray-500">{s.email}</div>
                  </td>
                  <td className="px-3 py-2">{planDisplayName(s.type)}</td>
                  <td className="px-3 py-2">
                    {formaterDate(s.echeance)}
                    {s.actif && s.joursRestants !== null && s.joursRestants <= 7 && (
                      <div className="text-orange-700">dans {s.joursRestants} j</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {s.siegesUtilises} / {s.maxUsers}
                  </td>
                  <td className="px-3 py-2">
                    {s.codePromo ? (
                      <span title={`Code ${s.codePromo}`}>Code promo</span>
                    ) : (
                      s.paiement || <span className="text-gray-400">aucun</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {s.actif ? (
                      <span className="text-green-700">Actif</span>
                    ) : (
                      <span className="text-red-700">
                        {s.statusBrut === 'suspended' ? 'Suspendu' : 'Inactif'}
                      </span>
                    )}
                    {/* Le statut brut n'est montré que s'il CONTREDIT l'état réel :
                        c'est le signe d'un abonnement expiré jamais balayé. */}
                    {!s.actif && s.statusBrut === 'active' && (
                      <div className="text-gray-400" title="Statut jamais remis à jour après l'échéance">
                        (marqué « active » en base)
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2 justify-end">
                      <BoutonGeste onClick={() => void prolonger(s)} disabled={enCours}>
                        Prolonger
                      </BoutonGeste>
                      <BoutonGeste onClick={() => void changerPalier(s)} disabled={enCours}>
                        Palier
                      </BoutonGeste>
                      {s.statusBrut === 'suspended' ? (
                        <BoutonGeste onClick={() => void changerStatut(s, 'active')} disabled={enCours}>
                          Réactiver
                        </BoutonGeste>
                      ) : (
                        <BoutonGeste onClick={() => void changerStatut(s, 'suspended')} disabled={enCours}>
                          Suspendre
                        </BoutonGeste>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    Aucun abonné ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Compteur({
  valeur,
  libelle,
  precision,
}: {
  valeur: number;
  libelle: string;
  precision?: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="text-2xl font-bold text-gray-900">{valeur}</div>
      <div className="text-sm text-gray-700">{libelle}</div>
      {precision && <div className="text-xs text-gray-500 mt-0.5">{precision}</div>}
    </div>
  );
}

function BoutonGeste({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {children}
    </button>
  );
}
