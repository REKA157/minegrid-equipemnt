import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  listPromoCodes,
  createPromoCode,
  setPromoActive,
  promoRedemptions,
  type CodePromo,
} from '../../utils/api/platformAdmin';
import { planDisplayName } from '../../config/plans';
import { toast } from '../../utils/toast';

/**
 * Codes promo — aujourd'hui le SEUL moyen propre d'activer un client payant,
 * tant que le compte Paddle « live » n'existe pas.
 *
 * L'état affiché est « utilisable », qui croise les trois conditions : actif,
 * non périmé, quota non atteint. Montrer le seul drapeau « actif » laisserait
 * donner à un client un code épuisé — et le refus tomberait sous ses yeux.
 */

function formaterDate(iso: string | null): string {
  if (!iso) return 'sans limite';
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

export default function AdminPromo() {
  const [codes, setCodes] = useState<CodePromo[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [detail, setDetail] = useState<{ code: string; uses: { email: string; date: string }[] } | null>(null);

  const [code, setCode] = useState('');
  const [plan, setPlan] = useState('enterprise');
  const [jours, setJours] = useState('30');
  const [maxUses, setMaxUses] = useState('1');
  const [motif, setMotif] = useState('');

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      setCodes(await listPromoCodes());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const creer = async () => {
    if (!code.trim()) {
      toast.info('Indiquez un code (4 caractères minimum).');
      return;
    }
    if (!motif.trim()) {
      toast.info('Un motif écrit est obligatoire — il sera consigné au journal.');
      return;
    }
    setEnCours(true);
    try {
      await createPromoCode(code.trim(), plan, Number(jours), Number(maxUses), motif.trim());
      toast.success(`Code ${code.trim().toUpperCase()} créé.`);
      setCode('');
      setMotif('');
      await recharger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La création a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const basculer = async (c: CodePromo) => {
    const raison = window.prompt(
      `${c.actif ? 'Désactiver' : 'Réactiver'} le code ${c.code} ?\n\nMotif (obligatoire, consigné au journal) :`,
    );
    if (raison === null) return;
    if (!raison.trim()) {
      toast.info('Un motif écrit est obligatoire.');
      return;
    }
    setEnCours(true);
    try {
      await setPromoActive(c.id, !c.actif, raison.trim());
      toast.success(`Code ${c.code} ${c.actif ? 'désactivé' : 'réactivé'}.`);
      await recharger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'opération a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  const voirUtilisations = async (c: CodePromo) => {
    try {
      setDetail({ code: c.code, uses: await promoRedemptions(c.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lecture impossible.');
    }
  };

  return (
    <div>
      <section className="rounded-md border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Créer un code</h2>
        <p className="text-sm text-gray-600 mb-4">
          Un code donne un accès payant gratuit et temporaire. Il est vérifié par le serveur, et un
          même compte ne peut l'utiliser qu'une fois.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm sm:col-span-2">
            <span className="block text-gray-700 mb-1">Code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BIENVENUE2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Palier offert</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {/* Libellés officiels : les codes internes sont croisés. */}
              <option value="pro">{planDisplayName('pro')}</option>
              <option value="premium">{planDisplayName('premium')}</option>
              <option value="enterprise">{planDisplayName('enterprise')}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Durée (jours)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={jours}
              onChange={(e) => setJours(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Utilisations max</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>
          <label className="text-sm sm:col-span-3">
            <span className="block text-gray-700 mb-1">
              Motif <span className="text-gray-500">(obligatoire, consigné au journal)</span>
            </span>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex. : campagne de lancement, geste commercial"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>
        </div>
        <button
          onClick={() => void creer()}
          disabled={enCours}
          className="mt-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-md disabled:opacity-50"
        >
          {enCours ? 'En cours…' : 'Créer le code'}
        </button>
      </section>

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
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Offre</th>
                <th className="px-3 py-2 font-medium">Utilisations</th>
                <th className="px-3 py-2 font-medium">Expire</th>
                <th className="px-3 py-2 font-medium">État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-mono">{c.code}</td>
                  <td className="px-3 py-2">
                    {planDisplayName(c.plan)} · {c.jours} j
                  </td>
                  <td className="px-3 py-2">
                    {c.usesCount} / {c.maxUses}
                  </td>
                  <td className="px-3 py-2">{formaterDate(c.expireLe)}</td>
                  <td className="px-3 py-2">
                    {c.utilisable ? (
                      <span className="text-green-700">Utilisable</span>
                    ) : (
                      <span className="text-red-700">
                        {!c.actif
                          ? 'Désactivé'
                          : c.usesCount >= c.maxUses
                            ? 'Épuisé'
                            : 'Périmé'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => void voirUtilisations(c)}
                        className="text-gray-600 hover:text-gray-900 hover:underline"
                      >
                        Qui l'a utilisé
                      </button>
                      <button
                        onClick={() => void basculer(c)}
                        disabled={enCours}
                        className="text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
                      >
                        {c.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    Aucun code promo pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="mt-4 rounded-md border border-gray-200 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-semibold text-gray-900">Utilisations du code {detail.code}</h3>
            <button
              onClick={() => setDetail(null)}
              className="text-sm text-gray-600 hover:underline"
            >
              Fermer
            </button>
          </div>
          {detail.uses.length === 0 ? (
            <p className="text-sm text-gray-500">Ce code n'a jamais été utilisé.</p>
          ) : (
            <ul className="text-sm text-gray-700 space-y-1">
              {detail.uses.map((u, i) => (
                <li key={i}>
                  {u.email} — {formaterDate(u.date)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
