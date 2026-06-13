import React from 'react';
import { ShieldQuestion, ClipboardCheck, Lock, Banknote } from 'lucide-react';

// Bande « services MineGrid » sur les cartes de résultats. PRÉSENTATIONNELLE :
// aucune requête par carte (pas de surcharge sur une liste). Statut HONNÊTE — ces
// capacités existent mais ne sont pas encore actives : la confiance vendeur n'est
// pas vérifiée tant que le Trust Layer n'est pas déployé, et l'inspection/le
// séquestre/le financement dépendent de partenaires. On n'affirme RIEN (chips
// grisées « bientôt »), on ne fabrique aucune donnée. Le détail réel par machine
// s'affiche sur la fiche (MachineTrustPanel, qui lit les données réelles).
const ITEMS = [
  { icon: ShieldQuestion, label: 'Confiance', title: 'Vérification vendeur — non disponible (Trust Layer à déployer)' },
  { icon: ClipboardCheck, label: 'Inspection', title: "Inspection à la demande — en attente d'activation partenaire" },
  { icon: Lock, label: 'Séquestre', title: "Paiement sécurisé — en attente d'intégration partenaire" },
  { icon: Banknote, label: 'Financement', title: "Financement — en attente d'intégration partenaire" },
];

export default function MachineCardTrustStrip() {
  return (
    <div className="mb-1 flex flex-wrap gap-1.5" aria-label="Services MineGrid (à venir)">
      {ITEMS.map(({ icon: Icon, label, title }) => (
        <span
          key={label}
          title={title}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-400"
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>
      ))}
    </div>
  );
}
