import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    /** Une seule copie de React / react-query : évite « No QueryClient set » avec des chunks isolés. */
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  server: {
    // PORT env (utilisé par les outils de preview) prime, sinon 5173.
    port: Number(process.env.PORT) || 5173,
    /**
     * Relais IA — DÉVELOPPEMENT UNIQUEMENT (ignoré par `vite build`).
     *
     * L'Edge Function IA déployée n'autorise en CORS que le domaine de
     * production : un appel direct depuis http://localhost:* est bloqué par le
     * navigateur. Le serveur de dev relaie donc la requête (pas de CORS entre
     * serveurs), ce qui permet de tester l'IA réelle en local SANS toucher à la
     * configuration de production ni dupliquer la clé Anthropic.
     *
     * Activation : VITE_TENDERS_AI_URL=/ia-appels-offres (+ VITE_TENDERS_AI_KEY).
     */
    proxy: {
      '/ia-appels-offres': {
        target: 'https://tnfbggrftmtxpgbcwqzo.supabase.co',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/functions/v1/renders-ai',
      },
    },
  },
  optimizeDeps: {
    // lucide-react expose des centaines d'icones : l'exclure du pre-bundling
    // evite que Vite les scanne toutes au demarrage dev, ce qui accelerait
    // le cold start et reduirait les faux positifs de rebuild.
    exclude: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Decoupage manuel pour reduire le chunk `index` initial.
         * Cible : bundle initial < 250 kB (vs 460 kB actuellement) en
         * isolant les deps lourdes qui ne sont pas utilisees sur la
         * page d'accueil.
         *
         * - react-vendor : react + react-dom + react-query (même fichier = même contexte)
         * - supabase     : utilise partout, mais en chunk separe pour
         *                  meilleur cache entre deploiements
         * - charts/maps/grid/paddle : chunks optionnels charges a la
         *                  demande par les pages qui en ont besoin
         */
        manualChunks: {
          'react-vendor': ['react', 'react-dom', '@tanstack/react-query'],
          'supabase': ['@supabase/supabase-js'],
          'charts': ['recharts', 'chart.js', 'react-chartjs-2'],
          'maps': ['leaflet'],
          'grid': ['react-grid-layout', '@hello-pangea/dnd'],
          'paddle': ['@paddle/paddle-js'],
          'zustand': ['zustand'],
        },
      },
    },
  },
});
