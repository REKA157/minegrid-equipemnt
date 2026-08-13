import { useEffect, useState } from 'react';
import { isAuthLinkReturn, clearAuthLinkTraces } from '../utils/authLink';

/**
 * « Est-on en train d'afficher l'écran issu d'un lien e-mail ? »
 *
 * POURQUOI UN ÉTAT ET NON L'INSTANTANÉ DIRECT
 * -------------------------------------------
 * `isAuthLinkReturn()` est figé pour toute la durée de la page : une fois vrai,
 * il le reste. Utilisé tel quel pour décider du rendu — et testé AVANT le
 * routeur —, il piégeait l'utilisateur sur l'écran de mot de passe : le routeur
 * du site est un routeur par fragment, qui provoque un simple re-rendu et non un
 * rechargement du document. Chaque lien du menu, et jusqu'au bouton « Aller à la
 * connexion », changeait l'adresse sans rien changer à l'écran. Seule la touche
 * F5 permettait de sortir. Reproduit dans le navigateur le 2026-08-12.
 *
 * D'où cet état, remis à faux dès la première navigation : le lien e-mail décide
 * du PREMIER écran, puis le routeur reprend la main normalement.
 */
export function useAuthLinkReturn(): boolean {
  const [actif, setActif] = useState<boolean>(() => isAuthLinkReturn());

  useEffect(() => {
    if (!actif) return undefined;
    const rendreLaMain = () => {
      // L'utilisateur quitte l'écran : on efface `?type=recovery` de la barre
      // d'adresse. Sans cela, un rechargement, un retour arrière ou un favori
      // ramèneraient indéfiniment sur cet écran.
      clearAuthLinkTraces();
      setActif(false);
    };
    window.addEventListener('hashchange', rendreLaMain);
    return () => window.removeEventListener('hashchange', rendreLaMain);
  }, [actif]);

  return actif;
}
