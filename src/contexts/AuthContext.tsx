import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/auth-js';
import supabaseClient from '../utils/supabaseClient';
import { migrateLegacyKeysForUser } from '../utils/accountLocalStorage';

/**
 * Contexte d'authentification global.
 *
 * Objectif : UN SEUL listener `onAuthStateChange` pour toute l'application,
 * partage via React Context. Avant ce module, chaque composant qui
 * appelait `useAuth()` (ex : `ProtectedRoute`, `FinancingRequest`)
 * creait sa propre souscription Supabase, ce qui multiplie les
 * requetes reseau et peut causer des races lors des refresh de token.
 *
 * API publique : `{ user, loading }` - strictement identique a
 * l'ancien hook `src/hooks/useAuth.ts`, donc aucun site d'appel ne
 * change. L'ancien hook est maintenant un simple re-export de
 * `useAuth()` ci-dessous.
 */

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    supabaseClient.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (mountedRef.current) {
          const u = data.session?.user ?? null;
          if (u?.id) {
            try {
              migrateLegacyKeysForUser(u.id);
            } catch {
              /* ignore migrate */
            }
          }
          setUser(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });

    const { data: listener } = supabaseClient.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (mountedRef.current) {
          const u = session?.user ?? null;
          if (u?.id) {
            try {
              migrateLegacyKeysForUser(u.id);
            } catch {
              /* ignore */
            }
          }
          setUser(u);
        }
      },
    );

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook de lecture du contexte d'auth. Identique en signature a l'ancien
 * `src/hooks/useAuth.ts`, mais lit le context au lieu de creer son
 * propre listener.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
