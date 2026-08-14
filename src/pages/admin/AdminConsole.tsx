import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import AdminSubscribers from './AdminSubscribers';
import AdminAccess from './AdminAccess';
import AdminJournal from './AdminJournal';

/**
 * Coquille de la console d'administration de la plateforme.
 *
 * Trois onglets, dans l'ordre d'usage réel : les abonnés d'abord (l'écran ouvert
 * dix fois par jour), les accès ensuite, le journal en dernier.
 *
 * Les onglets ne sont qu'un confort d'affichage : chaque fonction serveur
 * revérifie l'identité de l'appelant, et la garde `RequirePlatformAdmin` protège
 * déjà la route. Rien ici n'accorde de droit.
 */

type Onglet = 'abonnes' | 'acces' | 'journal';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'abonnes', libelle: 'Abonnés' },
  { cle: 'acces', libelle: 'Accès' },
  { cle: 'journal', libelle: 'Journal' },
];

export default function AdminConsole() {
  const [onglet, setOnglet] = useState<Onglet>('abonnes');

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
          </button>
        ))}
      </nav>

      {onglet === 'abonnes' && <AdminSubscribers />}
      {onglet === 'acces' && <AdminAccess />}
      {onglet === 'journal' && <AdminJournal />}
    </div>
  );
}
