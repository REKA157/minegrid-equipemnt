import { QueryClient } from '@tanstack/react-query';

/**
 * Instance unique partagée par toute l’app. Évite les doublons de contexte React Query
 * lorsque le bundler isole le package dans un chunk séparé.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
