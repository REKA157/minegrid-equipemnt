import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { contactUnreadCount } from '../../utils/api/platformAdmin';
import AdminSubscribers from './AdminSubscribers';
import AdminAccess from './AdminAccess';
import AdminContact from './AdminContact';
import AdminPromo from './AdminPromo';
import AdminPayments from './AdminPayments';
import AdminJournal from './AdminJournal';

/**
 * Coquille de la console d'administration de la plateforme.
 *
 * Six onglets, dans l'ordre d'usage réel : les abonnés d'abord (l'écran ouvert
 * dix fois par jour), puis les paiements, les messages reçus, les codes promo,
 * les accès, et le journal en dernier.
 *
 * Les onglets ne sont qu'un confort d'affichage : chaque fonction serveur
 * revérifie l'identité de l'appelant, et la garde `RequirePlatformAdmin` protège
 * déjà la route. Rien ici n'accorde de droit.
 */

type Onglet = 'abonnes' | 'paiements' | 'messages' | 'promo' | 'acces' | 'journal';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'abonnes', libelle: 'Abonnés' },
  { cle: 'paiements', libelle: 'Paiements' },
  { cle: 'messages', libelle: 'Messages' },
  { cle: 'promo', libelle: 'Codes promo' },
  { cle: 'acces', libelle: 'Accès' },
  { cle: 'journal', libelle: 'Journal' },
];

export default function AdminConsole() {
  const [onglet, setOnglet] = useState<Onglet>('abonnes');
  // Pastille des messages non lus : ces demandes commerciales dormaient en base
  // sans que personne les voie. Le compteur est là pour qu'on ne les rate plus.
  const [nonLus, setNonLus] = useState(0);

  useEffect(() => {
    let vivant = true;
    contactUnreadCount()
      .then((n) => {
        if (vivant) setNonLus(n);
      })
      .catch(() => {
        /* la pastille est un confort : son absence ne doit rien casser */
      });
    return () => {
      vivant = false;
    };
  }, [onglet]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex items-start gap-3 mb-6">
        <ShieldCheck className="h-7 w-7 text-orange-600 shrink-0 mt-0.5" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administration de la plateforme</h1>
          <p className="text-sm text-gray-600 mt-1">
            Réservé à l'équipe MineGrid. Chaque geste est consigné, avec son auteur et son motif,
            dans un journal que personne ne peut modifier.
          </p>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              onglet === o.cle
                ? 'border-orange-600 text-orange-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {o.libelle}
            {o.cle === 'messages' && nonLus > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-orange-600 px-1.5 text-xs font-semibold text-white">
                {nonLus}
              </span>
            )}
          </button>
        ))}
      </nav>

      {onglet === 'abonnes' && <AdminSubscribers />}
      {onglet === 'paiements' && <AdminPayments />}
      {onglet === 'messages' && <AdminContact />}
      {onglet === 'promo' && <AdminPromo />}
      {onglet === 'acces' && <AdminAccess />}
      {onglet === 'journal' && <AdminJournal />}
    </div>
  );
}
