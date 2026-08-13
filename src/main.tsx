// EN PREMIER, avant toute autre chose : ce module lit l'URL au chargement pour
// capter les paramètres des liens e-mail (réinitialisation de mot de passe,
// lien périmé…). Le client Supabase et le routeur effacent ensuite le fragment ;
// sans cette capture préalable, l'information serait perdue.
import './utils/authLink';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './queryClient';
// CSS Leaflet auto-hébergé (bundlé par Vite) au lieu du CDN unpkg dans index.html.
import 'leaflet/dist/leaflet.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <StrictMode>
      <App />
    </StrictMode>
  </QueryClientProvider>
);
