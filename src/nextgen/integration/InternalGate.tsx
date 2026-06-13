import React from 'react';
import { Lock } from 'lucide-react';

// Garde « interne / démo » pour l'espace #nextgen. Contrôlé par un flag de
// DÉPLOIEMENT (VITE_ENABLE_NEXTGEN), pas par l'obscurité de l'URL : par défaut,
// l'espace est INACCESSIBLE (page restreinte). On l'active explicitement par
// environnement (dev/démo interne) — jamais ouvert au public par défaut.
export function isNextGenInternalEnabled(): boolean {
  return (import.meta.env.VITE_ENABLE_NEXTGEN as string | undefined) === 'true';
}

export default function InternalGate({ children }: { children: React.ReactNode }) {
  if (isNextGenInternalEnabled()) return <>{children}</>;
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Lock className="h-7 w-7 text-gray-400" />
      </div>
      <h1 className="text-lg font-bold text-gray-900">Espace interne</h1>
      <p className="text-sm text-gray-500 mt-1">
        L'espace NextGen (démo/admin) n'est pas activé sur cet environnement.
        Définissez <code className="text-xs bg-gray-100 px-1 rounded">VITE_ENABLE_NEXTGEN=true</code> pour y accéder.
      </p>
    </div>
  );
}
