import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  listPlatformAdmins,
  grantPlatformAdmin,
  revokePlatformAdmin,
  getPlatformAdminRole,
  type PlatformAdmin,
} from '../../utils/api/platformAdmin';
import { toast } from '../../utils/toast';

/**
 * Console d'administration de la plateforme — premier écran : les accès.
 *
 * Palette sobre (gris + orange), comme le reste du produit : le vert et le
 * rouge sont réservés aux verdicts (actif / révoqué), pas à la décoration.
 *
 * Aucun geste n'est possible sans MOTIF ÉCRIT : le serveur le refuse de toute
 * façon, l'écran le demande donc franchement plutôt que de laisser l'utilisateur
 * se heurter à une erreur.
 */

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

const LIBELLE_ROLE: Record<PlatformAdmin['role'], string> = {
  owner: 'Principal',
  support: 'Support',
  finance: 'Finance',
  moderation: 'Modération',
};

export default function AdminAccess() {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [monRole, setMonRole] = useState<PlatformAdmin['role'] | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const [nouvelEmail, setNouvelEmail] = useState('');
  const [nouveauRole, setNouveauRole] = useState<PlatformAdmin['role']>('support');
  const [motif, setMotif] = useState('');

  const recharger = async () => {
    setChargement(true);
    setErreur('');
    try {
      const [liste, role] = await Promise.all([listPlatformAdmins(), getPlatformAdminRole()]);
      setAdmins(liste);
      setMonRole(role);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    void recharger();
  }, []);

  const nommer = async () => {
    if (!nouvelEmail.trim()) {
      toast.info("Indiquez l'adresse e-mail du compte à nommer.");
      return;
    }
    if (!motif.trim()) {
      toast.info('Un motif écrit est obligatoire — il sera consigné au journal.');
      return;
    }
    setEnCours(true);
    try {
      await grantPlatformAdmin(nouvelEmail.trim(), nouveauRole, motif.trim());
      toast.success(`${nouvelEmail.trim()} est désormais administrateur.`);
      setNouvelEmail('');
      setMotif('');
      await recharger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La nomination a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const revoquer = async (admin: PlatformAdmin) => {
    const raison = window.prompt(
      `Retirer l'accès de ${admin.email} ?\n\nMotif (obligatoire, consigné au journal) :`,
    );
    if (raison === null) return;
    if (!raison.trim()) {
      toast.info('Un motif écrit est obligatoire.');
      return;
    }
    setEnCours(true);
    try {
      await revokePlatformAdmin(admin.userId, raison.trim());
      toast.success(`Accès de ${admin.email} retiré.`);
      await recharger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La révocation a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const actifs = admins.filter((a) => a.actif);

  return (
    <div>

      {erreur && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-gray-300 bg-gray-50 p-3">
          <AlertTriangle className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">{erreur}</p>
        </div>
      )}

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Administrateurs</h2>
          <span className="text-sm text-gray-500">
            {actifs.length} actif{actifs.length > 1 ? 's' : ''}
          </span>
        </div>

        {chargement ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Compte</th>
                  <th className="px-4 py-2 font-medium">Rôle</th>
                  <th className="px-4 py-2 font-medium">Depuis</th>
                  <th className="px-4 py-2 font-medium">État</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((a) => (
                  <tr key={a.userId} className={a.actif ? '' : 'text-gray-400'}>
                    <td className="px-4 py-2">{a.email}</td>
                    <td className="px-4 py-2">{LIBELLE_ROLE[a.role]}</td>
                    <td className="px-4 py-2">{formaterDate(a.grantedAt)}</td>
                    <td className="px-4 py-2">
                      {a.actif ? (
                        <span className="text-green-700">Actif</span>
                      ) : (
                        <span className="text-red-700">Révoqué le {formaterDate(a.revokedAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {a.actif && monRole === 'owner' && (
                        <button
                          onClick={() => void revoquer(a)}
                          disabled={enCours}
                          className="text-sm text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
                        >
                          Retirer l'accès
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      Aucun administrateur enregistré.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {monRole === 'owner' && (
        <section className="rounded-md border border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Nommer un administrateur</h2>
          <p className="text-sm text-gray-600 mb-4">
            Le compte doit déjà exister sur la plateforme. Vous ne pouvez pas modifier votre propre
            accès — c'est refusé par la base, pas seulement par cet écran.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Adresse e-mail du compte</span>
              <input
                type="email"
                value={nouvelEmail}
                onChange={(e) => setNouvelEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Rôle</span>
              <select
                value={nouveauRole}
                onChange={(e) => setNouveauRole(e.target.value as PlatformAdmin['role'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="support">Support</option>
                <option value="finance">Finance</option>
                <option value="moderation">Modération</option>
                <option value="owner">Principal</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="block text-gray-700 mb-1">
                Motif <span className="text-gray-500">(obligatoire, consigné au journal)</span>
              </span>
              <input
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex. : renfort support pour la saison"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
          </div>
          <button
            onClick={() => void nommer()}
            disabled={enCours}
            className="mt-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-md disabled:opacity-50"
          >
            {enCours ? 'En cours…' : 'Nommer'}
          </button>
        </section>
      )}
    </div>
  );
}
