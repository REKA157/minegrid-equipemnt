import { useEffect, useState } from 'react';
import { getMyMemberScope, FULL_SCOPE, type MemberScope } from '../utils/api/memberScope';

/**
 * Charge une fois l'affectation (commercial / appels d'offres) de l'utilisateur
 * connecté. Sert à rediriger un membre hors des espaces auxquels il n'est pas
 * affecté. `loading` reste vrai tant que la réponse serveur n'est pas arrivée
 * (on ne redirige jamais pendant ce laps de temps).
 */
export function useMemberScope(): { scope: MemberScope; loading: boolean } {
  const [scope, setScope] = useState<MemberScope>(FULL_SCOPE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMyMemberScope().then((s) => {
      if (!cancelled) {
        setScope(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { scope, loading };
}
