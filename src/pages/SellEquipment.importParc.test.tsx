import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Non-regression A18-001 / A18-002 — import de parc (webhook n8n).
 *
 * A18-001 : un jeton partage etait ecrit en clair dans l'en-tete `x-auth-token`.
 *   `import.meta.env` et les litteraux sont incrustes tels quels par Vite : le
 *   jeton etait donc servi a tout visiteur dans dist/assets/SellEquipment-*.js.
 * A18-002 : sans URL configuree, `fetch('')` designe le document courant. Le
 *   serveur de la SPA repond 200 + index.html, `response.ok` vaut true, et
 *   l'ecran annoncait « Donnees envoyees avec succes » sans que rien ne parte.
 */

vi.mock('../utils/api', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'vendeur-1', email: 'vendeur@example.test' })),
  publishMachine: vi.fn(async () => ({ id: 'machine-1' })),
}));

vi.mock('../utils/api/aiListing', () => ({
  generateListingCopy: vi.fn(async () => ({ ok: false, error: 'aucune ia' })),
}));

vi.mock('../services/autoSpecsService', () => ({
  fetchModelSpecs: vi.fn(),
  fetchModelSpecsFull: vi.fn(async () => ({ specs: null })),
  toSellEquipmentForm: vi.fn(() => ({})),
  summarizeSpecs: vi.fn(() => ''),
  missingForSell: vi.fn(() => []),
}));

const journal = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../utils/logger', () => ({ logger: journal, default: journal }));

const notifier = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  });
});
vi.mock('../utils/toast', () => ({ toast: notifier, default: notifier }));

/** Classeur minimal : une ligne d'en-tetes + une machine. Evite de charger exceljs (~600 ko). */
vi.mock('exceljs', () => {
  const ligne = (valeurs: unknown[]) => ({
    eachCell: (cb: (cell: { value: unknown }, colNum: number) => void) =>
      valeurs.forEach((v, i) => cb({ value: v }, i + 1)),
  });
  const feuille = {
    getRow: () => ligne(['marque', 'modele']),
    eachRow: (cb: (row: ReturnType<typeof ligne>, rowNum: number) => void) => {
      cb(ligne(['marque', 'modele']), 1);
      cb(ligne(['Caterpillar', '320D']), 2);
    },
  };
  class Workbook {
    xlsx = { load: async () => undefined };
    worksheets = [feuille];
  }
  return { default: { Workbook } };
});

import SellEquipment from './SellEquipment';

// import.meta.url n'est pas un file:// sous l'environnement jsdom de Vitest :
// on repart de la racine du projet, ou vitest est lance.
const SOURCE = readFileSync(resolve(process.cwd(), 'src/pages/SellEquipment.tsx'), 'utf8');

/** Tous les messages presentes a l'utilisateur, quel que soit le canal du toast. */
function messagesAffiches(): string[] {
  return [
    ...notifier.mock.calls,
    ...notifier.success.mock.calls,
    ...notifier.error.mock.calls,
    ...notifier.warning.mock.calls,
    ...notifier.info.mock.calls,
  ].map((args) => String(args[0]));
}

function annonceUneReussite(): boolean {
  return (
    notifier.success.mock.calls.length > 0 ||
    messagesAffiches().some((m) => /succ[eè]s|✅|envoy[eé]es avec/i.test(m))
  );
}

/** Ouvre la section d'import et charge un classeur, jusqu'a ce que les machines soient detectees. */
async function chargerUnClasseur() {
  fireEvent.click(screen.getByRole('button', { name: /Afficher l'import Excel/i }));

  const champ = document.getElementById('excel-upload') as HTMLInputElement;
  const classeur = new File(['classeur'], 'parc.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fireEvent.change(champ, { target: { files: [classeur] } });

  // Le compte de machines detectees ne s'affiche qu'une fois le classeur analyse.
  await waitFor(() => {
    expect(document.body.textContent).toContain('détectée');
  });
}

describe('SellEquipment — import de parc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("A18-001 : aucun jeton d'authentification litteral n'est ecrit dans le source", () => {
    // Un en-tete d'authentification dont la valeur est une chaine litterale est
    // recopie tel quel dans le bundle : il est public par construction.
    const enTeteLitteral =
      /['"][\w-]*(?:auth|token|secret|api[-_]?key)[\w-]*['"]\s*:\s*['"][^'"]{8,}['"]/gi;
    expect(SOURCE.match(enTeteLitteral)).toBeNull();
  });

  it("A18-002 : sans URL configuree, l'ecran annonce l'indisponibilite et n'appelle rien", async () => {
    vi.stubEnv('VITE_N8N_IMPORT_PARC_URL', '');

    // Se comporte comme un navigateur : une URL vide designe le document
    // courant, et le serveur d'une SPA y repond 200 + index.html.
    const appelReseau = vi.fn(async (cible: string) =>
      cible === ''
        ? new Response('<!doctype html><html><body>MineGrid</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          })
        : new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', appelReseau);

    render(<SellEquipment />);
    await chargerUnClasseur();

    // L'ecran doit le DIRE, pas seulement s'abstenir.
    expect(document.body.textContent).toMatch(/[Ii]mport de parc indisponible/);
    expect(screen.getByRole('button', { name: /^Envoyer$/i })).toBeDisabled();

    // Meme force, l'envoi ne part pas et n'annonce aucune reussite.
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/i }));
    await Promise.resolve();

    expect(annonceUneReussite()).toBe(false);
    expect(appelReseau).not.toHaveBeenCalled();
  });

  it('A18-002 : une reponse HTTP en erreur ne produit pas de message de reussite', async () => {
    vi.stubEnv('VITE_N8N_IMPORT_PARC_URL', 'https://import.example.test/parc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('workflow introuvable', { status: 404 })),
    );

    render(<SellEquipment />);
    await chargerUnClasseur();
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/i }));

    await waitFor(() => {
      expect(messagesAffiches().length).toBeGreaterThan(0);
    });
    expect(annonceUneReussite()).toBe(false);
  });

  it('A18-002 : un echec reseau ne produit pas de message de reussite', async () => {
    vi.stubEnv('VITE_N8N_IMPORT_PARC_URL', 'https://import.example.test/parc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    render(<SellEquipment />);
    await chargerUnClasseur();
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/i }));

    await waitFor(() => {
      expect(messagesAffiches().length).toBeGreaterThan(0);
    });
    expect(annonceUneReussite()).toBe(false);
  });

  it("A18-002 : une reponse 200 en HTML n'est pas un accuse de reception d'import", async () => {
    // Une URL mal configuree qui pointe sur une page repond 200 sans rien importer.
    vi.stubEnv('VITE_N8N_IMPORT_PARC_URL', 'https://www.minegrid.ma/');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html><html><body>MineGrid</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );

    render(<SellEquipment />);
    await chargerUnClasseur();
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/i }));

    await waitFor(() => {
      expect(messagesAffiches().length).toBeGreaterThan(0);
    });
    expect(annonceUneReussite()).toBe(false);
  });

  it("A18-001 : le contenu du classeur n'est jamais recopie dans les journaux", async () => {
    vi.stubEnv('VITE_N8N_IMPORT_PARC_URL', 'https://import.example.test/parc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
    );

    render(<SellEquipment />);
    await chargerUnClasseur();
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/i }));

    await waitFor(() => {
      expect(messagesAffiches().length).toBeGreaterThan(0);
    });

    const journalise = [
      ...journal.debug.mock.calls,
      ...journal.info.mock.calls,
      ...journal.warn.mock.calls,
      ...journal.error.mock.calls,
    ]
      .flat()
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v ?? null)))
      .join(' | ');

    // `data` porte le classeur encode en base64 ; `sellerId` identifie le vendeur.
    expect(journalise).not.toMatch(/"data"|"sellerId"|x-auth-token/i);
  });
});
