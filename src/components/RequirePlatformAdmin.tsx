import React, { useEffect, useState } from 'react';
import { isPlatformAdmin } from '../utils/api/platformAdmin';

/**
 * Garde de la console d'administration de la plateforme.
 *
 * COMPOSANT NEUF, ET C'EST VOLONTAIRE. Les gardes existantes ne conviennent
 * pas ici : l'une accepte un code d'accès sans compte (`VITE_MONITOR_TEMP_
 * ACCESS_CODE`), l'autre laisse passer en cas d'erreur pour ne pas bloquer un
 * client payant. Ces choix se défendent ailleurs ; devant la liste de tous les
 * abonnés, ils seraient fautifs.
 *
 * RÈGLE : refus par défaut. Pendant le chargement, sans session, sur erreur
 * réseau, sur réponse inattendue — on n'affiche rien. Un refus injustifié se
 * corrige d'un rechargement ; l'inverse ouvre les données de tous les clients.
 *
 * Ce que voit un visiteur non autorisé : « page introuvable », JAMAIS « accès
 * refusé ». Il n'a pas à apprendre que la console existe.
 *
 * Et ceci n'est qu'un confort d'affichage : chaque fonction serveur revérifie
 * l'identité de son côté. Contourner cet écran ne donne accès à rien.
 */

interface Props {
  children: React.ReactNode;
}

type Etat = 'verification' | 'autorise' | 'refuse';

export default function RequirePlatformAdmin({ children }: Props) {
  const [etat, setEtat] = useState<Etat>('verification');

  useEffect(() => {
    let vivant = true;
    isPlatformAdmin()
      .then((autorise) => {
        if (vivant) setEtat(autorise ? 'autorise' : 'refuse');
      })
      .catch(() => {
        if (vivant) setEtat('refuse');
      });
    return () => {
      vivant = false;
    };
  }, []);

  if (etat === 'verification') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500" />
      </div>
    );
  }

  if (etat === 'refuse') {
    // Indiscernable d'une adresse qui n'existe pas.
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Page introuvable</h1>
        <p className="text-sm text-gray-600 mb-6">
          L'adresse demandée n'existe pas ou n'est plus disponible.
        </p>
        <a
          href="#"
          className="text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
        >
          Retour à l'accueil
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
