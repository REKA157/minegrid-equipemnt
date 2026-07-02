// Flat config ESLint 9 — source unique de vérité.
//
// Objectif : documenter les règles d'hygiène sans faire rougir tout le dépôt.
// Les règles sensibles (no-console, no-explicit-any) sont en "warn" le temps
// de la migration. Elles passeront en "error" une fois le ménage fait :
//   - remplacer les console.* par le logger centralisé (src/utils/logger.ts)
//   - remplacer les `any` par des types Supabase générés
//
// Exclusions :
//   - `dist/`, `build/`, `node_modules/`, `coverage/` : artefacts
//   - `supabase/functions/` : Deno runtime, règles différentes
//   - `archive/**` : scripts legacy archivés (sprint hygiène), pas du code produit
//   - `services/**` : backend Python, hors scope TypeScript

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      'supabase/functions/**',
      'archive/**',
      'services/**',
      'docs/**',
      'migrations/**',
      'scripts/**',
      'public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Incompatibilité de versions : eslint 9.39 (règle de base `no-unused-expressions`)
  // × typescript-eslint 8.8 → la règle plante AU CHARGEMENT (context.options[0] undefined),
  // ce qui faisait tomber TOUT le lint (donc plus aucune règle n'était appliquée).
  // On désactive cette seule règle pour restaurer l'exécution du lint et de toutes les
  // autres règles. Correctif racine à planifier : aligner les versions (bump typescript-eslint).
  {
    rules: {
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  // Fichiers .js/.jsx de src (catalogues de widgets, utilitaires legacy) : ce sont des
  // modules navigateur/CommonJS de configuration, pas du TS strict. On leur donne les
  // globals attendus et on tolère `require` pour éviter des faux no-undef / no-require-imports
  // (correction de config, pas de masquage d'un vrai problème de code).
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'no-console': ['warn', { allow: ['error'] }],

      '@typescript-eslint/no-explicit-any': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
);
