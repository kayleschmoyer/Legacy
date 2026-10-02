import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { generateKeyPairSync } from 'crypto';

jest.mock('../apple-jws', () => ({
  verifyAppleJwsPayload: jest.fn(),
}));
jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn(),
}));

import {
  AppStoreServerApiError,
  fetchAppleTransactionHistory,
} from './app-store-server-api';
import { verifyAppleJwsPayload } from '../apple-jws';

const mockVerify = verifyAppleJwsPayload as jest.MockedFunction<
  typeof verifyAppleJwsPayload
>;
const mockFetch = jest.fn<typeof fetch>();

// Throwaway key generated per run — never a real credential.
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const TEST_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const ENV_KEYS = [
  'APPLE_IAP_KEY_ID',
  'APPLE_IAP_ISSUER_ID',
  'APPLE_IAP_PRIVATE_KEY',
  'APPLE_BUNDLE_ID',
  'APPLE_ENVIRONMENT',
];
const savedEnv: Record<string, string | undefined> = {};

function calledUrl(call: number): string {
  return mockFetch.mock.calls[call][0] as string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function tx(id: string, extra: Record<string, unknown> = {}) {
  return {
    transactionId: id,
    purchaseDate: 1_700_000_000_000,
    type: 'Auto-Renewable Subscription',
    price: 4990,
    currency: 'USD',
    ...extra,
  };
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env['APPLE_IAP_KEY_ID'] = 'KEY123';
  process.env['APPLE_IAP_ISSUER_ID'] = 'issuer-uuid';
  process.env['APPLE_IAP_PRIVATE_KEY'] = TEST_PEM;
  process.env['APPLE_BUNDLE_ID'] = 'com.example.app';
  process.env['APPLE_ENVIRONMENT'] = 'sandbox';
  mockFetch.mockReset();
  mockVerify.mockReset();
  mockVerify.mockImplementation((jws) => Promise.resolve(tx(jws)));
  global.fetch = mockFetch;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('fetchAppleTransactionHistory', () => {
  it('fetches and normalizes a single page from the sandbox host', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ hasMore: false, signedTransactions: ['t1'] }),
    );
    mockVerify.mockResolvedValueOnce(
      tx('t1', { revocationDate: 1_700_100_000_000, revocationReason: 1 }),
    );

    const result = await fetchAppleTransactionHistory('orig 1');

    expect(result).toEqual([
      {
        transactionId: 't1',
        purchaseDate: 1_700_000_000_000,
        priceCents: 499,
        currency: 'USD',
        type: 'Auto-Renewable Subscription',
        revocation: { revocationDate: 1_700_100_000_000, revocationReason: 1 },
      },
    ]);
    const [, init] = mockFetch.mock.calls[0];
    expect(calledUrl(0)).toBe(
      'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/history/orig%201',
    );
    expect((init?.headers as Record<string, string>)['Authorization']).toMatch(
      /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/,
    );
  });

  it('uses the production host and nulls missing price/revocation', async () => {
    process.env['APPLE_ENVIRONMENT'] = 'production';
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ signedTransactions: ['t1'] }),
    );
    mockVerify.mockResolvedValueOnce({
      transactionId: 't1',
      purchaseDate: 1,
      type: 'Non-Consumable',
    });

    const [entry] = await fetchAppleTransactionHistory('orig');

    expect(calledUrl(0)).toContain('https://api.storekit.itunes.apple.com/');
    expect(entry).toMatchObject({
      priceCents: null,
      currency: null,
      revocation: null,
    });
  });

  it('follows pagination using the revision cursor', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          hasMore: true,
          revision: 'rev-1',
          signedTransactions: ['t1'],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ hasMore: false, signedTransactions: ['t2'] }),
      );

    const result = await fetchAppleTransactionHistory('orig');

    expect(result.map((e) => e.transactionId)).toEqual(['t1', 't2']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(calledUrl(1)).toContain('revision=rev-1');
  });

  it('throws a typed HTTP_ERROR on a non-200 response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(fetchAppleTransactionHistory('orig')).rejects.toMatchObject({
      name: 'AppStoreServerApiError',
      code: 'HTTP_ERROR',
      status: 401,
    });
  });

  it('throws INVALID_PRIVATE_KEY for a malformed key without calling Apple', async () => {
    process.env['APPLE_IAP_PRIVATE_KEY'] = 'not-a-key';

    const promise = fetchAppleTransactionHistory('orig');

    await expect(promise).rejects.toBeInstanceOf(AppStoreServerApiError);
    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_PRIVATE_KEY',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws NOT_CONFIGURED when credentials are missing', async () => {
    delete process.env['APPLE_IAP_KEY_ID'];

    await expect(fetchAppleTransactionHistory('orig')).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });

  it('throws INVALID_TRANSACTION when JWS verification fails', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ signedTransactions: ['bad'] }),
    );
    mockVerify.mockRejectedValueOnce(new Error('bad signature'));

    await expect(fetchAppleTransactionHistory('orig')).rejects.toMatchObject({
      code: 'INVALID_TRANSACTION',
    });
  });
});
