import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Anti-façade — route #vitrine.
 *
 * Six actions affichaient un succès après un simple `setTimeout`, dont un coût
 * « 7 500 € » codé en dur et trois engagements de délai (« sous 2h », « 30
 * minutes », « sous 24h »). Ces tests verrouillent la règle : un message de
 * succès n'apparaît QUE si un mécanisme réel a répondu favorablement.
 */

const H = vi.hoisted(() => {
  const etat: { vitrine: Record<string, unknown> | null; machines: Record<string, unknown>[] } = {
    vitrine: null,
    machines: [],
  };

  const chaine = (resultat: () => unknown) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.order = () => Promise.resolve(resultat());
    q.single = () => Promise.resolve(resultat());
    q.maybeSingle = () => Promise.resolve(resultat());
    return q;
  };

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
    from: vi.fn((table: string) => {
      if (table === 'vitrines') return chaine(() => ({ data: etat.vitrine, error: null }));
      if (table === 'machines') return chaine(() => ({ data: etat.machines, error: null }));
      return chaine(() => ({ data: null, error: null }));
    }),
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        upload: async () => ({ data: null, error: null }),
      }),
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  };

  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });

  return { etat, supabase, toast, submitQuoteRequest: vi.fn() };
});

vi.mock('../utils/supabaseClient', () => ({ default: H.supabase }));
vi.mock('../utils/toast', () => ({ toast: H.toast, default: H.toast }));
vi.mock('../utils/api/memberScope', () => ({
  FULL_SCOPE: { commercial: true, tenders: true },
  getMyMemberScope: vi.fn(async () => ({ commercial: true, tenders: true })),
  isInvitedMember: () => false,
}));
vi.mock('../utils/api/quoteRequests', () => ({ submitQuoteRequest: H.submitQuoteRequest }));

import VitrinePersonnalisee from './VitrinePersonnalisee';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/pages/VitrinePersonnalisee.tsx'),
  'utf8',
);

const VITRINE_BASE = {
  id: 'v1',
  user_id: 'vendeur1',
  company_name: 'Atlas Engins',
  logo_url: '',
  description: 'Loueur de matériel',
  services: ['Location'],
  address: 'Casablanca',
  phone: '+212522000000',
  email: 'contact@atlas-engins.example',
  website: '',
  working_hours: 'Lun-Ven',
  specializations: [],
  certifications: [],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  business_type: 'both',
  founding_year: 2010,
  intervention_zone: 'Maroc',
  equipment_count: 2,
  projects_delivered: 10,
  whatsapp: '+212600000000',
  emergency_phone: '+212600000001',
  delivery_radius: 50,
  min_rental_duration: 1,
  deposit_required: true,
  fuel_included: false,
  driver_included: false,
  maintenance_included: true,
};

const MACHINES = [
  {
    id: 'm1',
    name: 'Pelle 320D',
    brand: 'Caterpillar',
    model: '320D',
    category: 'excavator',
    type: 'both',
    price: 45000,
    year: 2018,
    images: [],
    description: 'Pelle sur chenilles',
    location: 'Casablanca',
    is_available: true,
    rental_price_daily: 60,
    rental_price_weekly: 350,
    rental_price_monthly: 1200,
  },
  {
    id: 'm2',
    name: 'Chargeuse 950',
    brand: 'Caterpillar',
    model: '950',
    category: 'loader',
    type: 'both',
    price: 30000,
    year: 2019,
    images: [],
    description: 'Chargeuse sur pneus',
    location: 'Rabat',
    is_available: true,
    rental_price_daily: null,
    rental_price_weekly: null,
    rental_price_monthly: null,
  },
];

async function monterVitrine(vitrine: Record<string, unknown> = VITRINE_BASE) {
  H.etat.vitrine = vitrine;
  H.etat.machines = MACHINES.map((m) => ({ ...m }));
  window.location.hash = '#vitrine/vendeur1';
  const rendu = render(<VitrinePersonnalisee />);
  await screen.findByText('Atlas Engins');
  return rendu;
}

describe('VitrinePersonnalisee — aucun succès sans mécanisme réel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.submitQuoteRequest.mockReset();
  });

  it('la source ne contient plus aucune des six promesses simulées', () => {
    const interdits = [
      'Simulation de',
      '7 500',
      'Recommandations envoyées par email',
      'Estimation envoyée par email',
      'Demande de rappel enregistrée',
      'Expert contacté',
      'Devis bundle demandé',
      'Demande de réservation envoyée',
      'sous 2h',
      'dans les 30 minutes',
      'sous 24h',
      'dans les 24h',
    ];
    const restants = interdits.filter((motif) => SOURCE.includes(motif));
    expect(restants).toEqual([]);
  });

  it('les trois services inexistants (rappel, expert dédié, devis bundle) ne sont plus proposés', async () => {
    await monterVitrine();
    expect(screen.queryByRole('button', { name: /demander un rappel/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /contacter l'expert/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /demander un devis/i })).toBeNull();
  });

  it("le simulateur calcule à partir des champs saisis et du tarif réel de l'annonce", async () => {
    await monterVitrine();

    fireEvent.change(screen.getByLabelText(/équipement/i), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText(/durée de location/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/unité de durée/i), { target: { value: 'mois' } });
    fireEvent.click(screen.getByRole('button', { name: /estimer/i }));

    // 1 200 € / mois × 2 mois = 2 400 €, lu sur l'annonce et non codé en dur.
    await waitFor(() => expect(document.body.textContent).toMatch(/2\s?400/));
    expect(document.body.textContent).not.toMatch(/7\s?500/);
    expect(H.toast.success).not.toHaveBeenCalled();
  });

  it("le simulateur refuse d'inventer un montant quand l'annonce n'a pas de tarif de location", async () => {
    await monterVitrine();

    fireEvent.change(screen.getByLabelText(/équipement/i), { target: { value: 'm2' } });
    fireEvent.change(screen.getByLabelText(/durée de location/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /estimer/i }));

    await screen.findByText(/tarif de location n'est pas renseigné/i);
    expect(H.toast.success).not.toHaveBeenCalled();
  });

  it("les critères de recherche partent sur le canal de contact réel de l'entreprise", async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    await monterVitrine();

    fireEvent.change(screen.getByLabelText(/type de chantier/i), {
      target: { value: 'Mining / Extraction' },
    });
    fireEvent.click(screen.getByRole('button', { name: /envoyer mes critères/i }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0][0]);
    expect(url.startsWith('https://wa.me/212600000000?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Mining / Extraction');
    expect(H.toast.success).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("sans canal de contact renseigné, l'envoi des critères est désactivé et expliqué", async () => {
    await monterVitrine({ ...VITRINE_BASE, whatsapp: '', email: '', phone: '' });
    const bouton = screen.getByRole('button', { name: /envoyer mes critères/i });
    expect(bouton).toBeDisabled();
    expect(screen.getByText(/n'a pas renseigné de canal de contact/i)).toBeInTheDocument();
  });

  it('la demande de location écrit réellement une demande et affiche sa référence', async () => {
    H.submitQuoteRequest.mockResolvedValue({
      quoteId: 'q-123',
      transactionCaseId: null,
      buyerLoggedIn: false,
      sellerResolved: true,
      linkAttempted: false,
    });
    await monterVitrine();

    fireEvent.click(screen.getAllByRole('button', { name: /réserver maintenant/i })[0]);
    fireEvent.change(screen.getByLabelText(/votre nom/i), { target: { value: 'Karim B.' } });
    fireEvent.change(screen.getByLabelText(/votre email/i), {
      target: { value: 'karim@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/date de début/i), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }));

    await waitFor(() => expect(H.submitQuoteRequest).toHaveBeenCalledTimes(1));
    const payload = H.submitQuoteRequest.mock.calls[0][0];
    expect(payload.machine_id).toBe('m1');
    expect(payload.buyer_name).toBe('Karim B.');
    expect(payload.buyer_email).toBe('karim@example.com');
    expect(payload.message).toContain('2026-09-01');
    await waitFor(() => expect(H.toast.success).toHaveBeenCalled());
    expect(String(H.toast.success.mock.calls[0][0])).toContain('q-123');
  });

  it("si le serveur refuse la demande de location, aucun succès n'est affiché", async () => {
    H.submitQuoteRequest.mockRejectedValue(new Error('row-level security'));
    await monterVitrine();

    fireEvent.click(screen.getAllByRole('button', { name: /réserver maintenant/i })[0]);
    fireEvent.change(screen.getByLabelText(/votre nom/i), { target: { value: 'Karim B.' } });
    fireEvent.change(screen.getByLabelText(/votre email/i), {
      target: { value: 'karim@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }));

    await waitFor(() => expect(H.toast.error).toHaveBeenCalled());
    expect(H.toast.success).not.toHaveBeenCalled();
    // La modale reste ouverte : la saisie n'est pas perdue.
    expect(screen.getByLabelText(/votre nom/i)).toBeInTheDocument();
  });

  it("la demande de location exige nom et email avant tout appel serveur", async () => {
    await monterVitrine();

    fireEvent.click(screen.getAllByRole('button', { name: /réserver maintenant/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }));

    expect(H.submitQuoteRequest).not.toHaveBeenCalled();
    expect(H.toast.success).not.toHaveBeenCalled();
  });
});
