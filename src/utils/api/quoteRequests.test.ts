import { beforeEach, describe, expect, it, vi } from 'vitest';

const BUYER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SELLER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MACHINE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const QUOTE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CASE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

type MockConfig = {
  userId: string | null;
  machineSeller: Record<string, string | null> | null;
  quoteInsertError: { message: string } | null;
  quoteInsertId: string;
  transactionCaseInsertError: { message: string; code?: string } | null;
  transactionCaseId: string;
  rpcResult: { data: string | null; error: { message: string } | null };
};

const hoisted = vi.hoisted(() => {
  const QUOTE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const CASE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const mockConfig: MockConfig = {
    userId: null,
    machineSeller: null,
    quoteInsertError: null,
    quoteInsertId: QUOTE,
    transactionCaseInsertError: null,
    transactionCaseId: CASE,
    rpcResult: { data: null, error: null },
  };

  const rpcMock = vi.fn(async (_fn: string, _args: { p_quote_request_id: string }) => mockConfig.rpcResult);

  function resolveForTable(table: string, operation: 'select' | 'insert' | 'update') {
    if (table === 'machines' && operation === 'select') {
      if (!mockConfig.machineSeller) {
        return { data: null, error: null };
      }
      return { data: mockConfig.machineSeller, error: null };
    }

    if (table === 'quote_requests' && operation === 'insert') {
      if (mockConfig.quoteInsertError) {
        return { data: null, error: mockConfig.quoteInsertError };
      }
      return { data: { id: mockConfig.quoteInsertId }, error: null };
    }

    if (table === 'transaction_cases' && operation === 'insert') {
      if (mockConfig.transactionCaseInsertError) {
        return { data: null, error: mockConfig.transactionCaseInsertError };
      }
      return { data: { id: mockConfig.transactionCaseId }, error: null };
    }

    if (table === 'transaction_participants' && operation === 'insert') {
      return { data: null, error: null };
    }

    if (table === 'transaction_events' && operation === 'insert') {
      return { data: null, error: null };
    }

    if (table === 'quote_requests' && operation === 'update') {
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }

  function makeQueryBuilder(table: string) {
    let operation: 'select' | 'insert' | 'update' = 'select';

    const builder: Record<string, unknown> = {};

    const resolve = () => resolveForTable(table, operation);

    builder.select = vi.fn(() => builder);

    builder.eq = vi.fn(() => builder);

    builder.insert = vi.fn(() => {
      operation = 'insert';
      return builder;
    });

    builder.update = vi.fn(() => {
      operation = 'update';
      return builder;
    });

    builder.single = vi.fn(async () => resolve());

    builder.maybeSingle = vi.fn(async () => resolve());

    builder.then = (
      onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);

    return builder;
  }

  const fromMock = vi.fn((table: string) => makeQueryBuilder(table));

  const supabaseMock = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: mockConfig.userId ? { user: { id: mockConfig.userId } } : null,
        },
      })),
      getUser: vi.fn(async () => ({
        data: {
          user: mockConfig.userId ? { id: mockConfig.userId } : null,
        },
      })),
    },
    from: fromMock,
    rpc: rpcMock,
  };

  return { mockConfig, supabaseMock, rpcMock, fromMock, QUOTE, CASE };
});

vi.mock('../supabaseClient', () => ({
  default: hoisted.supabaseMock,
}));

vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { submitQuoteRequest } from './quoteRequests';
import { logger } from '../logger';

const basePayload = {
  machine_id: MACHINE_ID,
  machine_name: 'CAT D7',
  buyer_name: 'Test Buyer',
  buyer_email: 'buyer@example.com',
};

function resetMockConfig() {
  hoisted.mockConfig.userId = null;
  hoisted.mockConfig.machineSeller = null;
  hoisted.mockConfig.quoteInsertError = null;
  hoisted.mockConfig.quoteInsertId = hoisted.QUOTE;
  hoisted.mockConfig.transactionCaseInsertError = null;
  hoisted.mockConfig.transactionCaseId = hoisted.CASE;
  hoisted.mockConfig.rpcResult = { data: null, error: null };
}

describe('submitQuoteRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockConfig();
  });

  it('utilisateur anonyme : devis enregistré, pas de dossier transaction', async () => {
    hoisted.mockConfig.machineSeller = { seller_id: SELLER_ID };

    const result = await submitQuoteRequest(basePayload);

    expect(result.quoteId).toBe(QUOTE_ID);
    expect(result.buyerLoggedIn).toBe(false);
    expect(result.sellerResolved).toBe(true);
    expect(result.linkAttempted).toBe(false);
    expect(result.transactionCaseId).toBeNull();
    expect(hoisted.rpcMock).not.toHaveBeenCalled();
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('transaction_cases');
  });

  it('utilisateur authentifié + vendeur résolu : création dossier tentée', async () => {
    hoisted.mockConfig.userId = BUYER_ID;
    hoisted.mockConfig.machineSeller = { seller_id: SELLER_ID };

    const result = await submitQuoteRequest(basePayload);

    expect(result.quoteId).toBe(QUOTE_ID);
    expect(result.buyerLoggedIn).toBe(true);
    expect(result.sellerResolved).toBe(true);
    expect(result.linkAttempted).toBe(true);
    expect(result.transactionCaseId).toBe(CASE_ID);
    expect(result.participantsLinked).toBe(true);
    expect(hoisted.fromMock).toHaveBeenCalledWith('transaction_cases');
    expect(hoisted.fromMock).toHaveBeenCalledWith('transaction_participants');
    expect(hoisted.rpcMock).not.toHaveBeenCalled();
  });

  it('acheteur = vendeur : pas de dossier transaction', async () => {
    hoisted.mockConfig.userId = SELLER_ID;
    hoisted.mockConfig.machineSeller = { seller_id: SELLER_ID };

    const result = await submitQuoteRequest(basePayload);

    expect(result.quoteId).toBe(QUOTE_ID);
    expect(result.buyerLoggedIn).toBe(true);
    expect(result.sellerResolved).toBe(true);
    expect(result.linkAttempted).toBe(false);
    expect(result.transactionCaseId).toBeNull();
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('transaction_cases');
    expect(hoisted.rpcMock).not.toHaveBeenCalled();
  });

  it('échec INSERT transaction_cases : fallback RPC appelé', async () => {
    hoisted.mockConfig.userId = BUYER_ID;
    hoisted.mockConfig.machineSeller = { seller_id: SELLER_ID };
    hoisted.mockConfig.transactionCaseInsertError = { message: 'RLS policy violation', code: '42501' };
    hoisted.mockConfig.rpcResult = { data: CASE_ID, error: null };

    const result = await submitQuoteRequest(basePayload);

    expect(result.linkAttempted).toBe(true);
    expect(result.transactionCaseId).toBe(CASE_ID);
    expect(result.participantsLinked).toBe(true);
    expect(hoisted.rpcMock).toHaveBeenCalledOnce();
    expect(hoisted.rpcMock).toHaveBeenCalledWith('ensure_transaction_case_for_quote_request', {
      p_quote_request_id: QUOTE_ID,
    });
  });

  it('vendeur introuvable : devis enregistré sans dossier (fallback documenté)', async () => {
    hoisted.mockConfig.userId = BUYER_ID;
    hoisted.mockConfig.machineSeller = null;

    const result = await submitQuoteRequest(basePayload);

    expect(result.quoteId).toBe(QUOTE_ID);
    expect(result.buyerLoggedIn).toBe(true);
    expect(result.sellerResolved).toBe(false);
    expect(result.linkAttempted).toBe(false);
    expect(result.transactionCaseId).toBeNull();
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('transaction_cases');
    expect(hoisted.rpcMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('seller_id introuvable'),
      expect.objectContaining({ machine_id: MACHINE_ID }),
    );
  });

  it('vendeur introuvable via machine mais présent dans le payload : dossier créé', async () => {
    hoisted.mockConfig.userId = BUYER_ID;
    hoisted.mockConfig.machineSeller = null;

    const result = await submitQuoteRequest({
      ...basePayload,
      seller_id: SELLER_ID,
    });

    expect(result.sellerResolved).toBe(true);
    expect(result.linkAttempted).toBe(true);
    expect(result.transactionCaseId).toBe(CASE_ID);
  });
});
