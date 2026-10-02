/**
 * App Store Server API client — fetches an Apple user's transaction history.
 *
 * Calls `GET /inApps/v1/history/{originalTransactionId}` authenticated with an
 * ES256 JWT signed by our App Store Connect API key, follows `hasMore`
 * pagination, and verifies each returned signed transaction with the shared
 * Apple JWS verifier before normalizing it. Not wired into any resolver yet.
 */
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { verifyAppleJwsPayload } from '../apple-jws';
import '../env';

const PRODUCTION_BASE_URL = 'https://api.storekit.itunes.apple.com';
const SANDBOX_BASE_URL = 'https://api.storekit-sandbox.itunes.apple.com';

// Apple caps App Store Server API JWT lifetime at 60 minutes; stay well below.
const JWT_LIFETIME_SECONDS = 5 * 60;
// Defensive bound so a misbehaving `hasMore` loop cannot spin forever.
const MAX_HISTORY_PAGES = 50;

export type AppStoreServerApiErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_PRIVATE_KEY'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_TRANSACTION'
  | 'TOO_MANY_PAGES';

export class AppStoreServerApiError extends Error {
  constructor(
    readonly code: AppStoreServerApiErrorCode,
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppStoreServerApiError';
  }
}

export interface AppleTransactionHistoryEntry {
  transactionId: string;
  /** Epoch milliseconds. */
  purchaseDate: number;
  /** Price in minor currency units (cents); null when Apple omits it. */
  priceCents: number | null;
  /** ISO 4217 currency code; null when Apple omits it. */
  currency: string | null;
  /** Apple product type, e.g. "Auto-Renewable Subscription". */
  type: string;
  revocation: {
    /** Epoch milliseconds. */
    revocationDate: number;
    /** 0 = other reason, 1 = app issue (per Apple). */
    revocationReason: number | null;
  } | null;
}

const historyResponseSchema = z.object({
  hasMore: z.boolean().optional(),
  revision: z.string().optional(),
  signedTransactions: z.array(z.string()).optional(),
});

const historyTransactionSchema = z.object({
  transactionId: z.string().min(1),
  purchaseDate: z.number().int(),
  // Milliunits of `currency` (e.g. 4990 = 4.99); Apple omits it for free items.
  price: z.number().int().optional(),
  currency: z.string().optional(),
  type: z.string().min(1),
  revocationDate: z.number().int().optional(),
  revocationReason: z.number().int().optional(),
});

interface AppStoreCredentials {
  keyId: string;
  issuerId: string;
  privateKey: string;
  bundleId: string;
}

async function resolveValue(
  localName: string,
  secretNameVar: string,
): Promise<string> {
  const local = process.env[localName];
  if (local) return local;
  const secretName = process.env[secretNameVar];
  if (secretName) return retrieveSecretParameterValue(secretName);
  throw new AppStoreServerApiError(
    'NOT_CONFIGURED',
    `App Store Server API not configured: set ${localName} or ${secretNameVar}`,
  );
}

async function loadCredentials(): Promise<AppStoreCredentials> {
  const [keyId, issuerId, privateKey, bundleId] = await Promise.all([
    resolveValue('APPLE_IAP_KEY_ID', 'APPLE_IAP_KEY_ID_SECRET_NAME'),
    resolveValue('APPLE_IAP_ISSUER_ID', 'APPLE_IAP_ISSUER_ID_SECRET_NAME'),
    resolveValue('APPLE_IAP_PRIVATE_KEY', 'APPLE_IAP_PRIVATE_KEY_SECRET_NAME'),
    resolveValue('APPLE_BUNDLE_ID', 'APPLE_BUNDLE_ID_SECRET_NAME'),
  ]);
  return { keyId, issuerId, privateKey, bundleId };
}

function getBaseUrl(): string {
  const env = (process.env['APPLE_ENVIRONMENT'] ?? 'production').toLowerCase();
  return env === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

async function signApiToken(creds: AppStoreCredentials): Promise<string> {
  let key: Awaited<ReturnType<typeof importPKCS8>>;
  try {
    // Env-var delivery commonly flattens newlines to literal "\n".
    key = await importPKCS8(creds.privateKey.replace(/\\n/g, '\n'), 'ES256');
  } catch (error) {
    throw new AppStoreServerApiError(
      'INVALID_PRIVATE_KEY',
      'App Store Server API private key is not a valid PKCS#8 ES256 key',
      undefined,
      error,
    );
  }
  return new SignJWT({ bid: creds.bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' })
    .setIssuer(creds.issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime(`${JWT_LIFETIME_SECONDS}s`)
    .sign(key);
}

async function normalizeTransaction(
  signed: string,
): Promise<AppleTransactionHistoryEntry> {
  let payload: unknown;
  try {
    payload = await verifyAppleJwsPayload(signed);
  } catch (error) {
    throw new AppStoreServerApiError(
      'INVALID_TRANSACTION',
      'Apple history transaction failed JWS verification',
      undefined,
      error,
    );
  }
  const parsed = historyTransactionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppStoreServerApiError(
      'INVALID_TRANSACTION',
      'Apple history transaction payload is missing required fields',
    );
  }
  const t = parsed.data;
  return {
    transactionId: t.transactionId,
    purchaseDate: t.purchaseDate,
    priceCents: t.price === undefined ? null : Math.round(t.price / 10),
    currency: t.currency ?? null,
    type: t.type,
    revocation:
      t.revocationDate === undefined
        ? null
        : {
            revocationDate: t.revocationDate,
            revocationReason: t.revocationReason ?? null,
          },
  };
}

/**
 * Fetch the full transaction history for an Apple customer, following
 * pagination. Throws {@link AppStoreServerApiError} on any failure.
 */
export async function fetchAppleTransactionHistory(
  originalTransactionId: string,
): Promise<AppleTransactionHistoryEntry[]> {
  const creds = await loadCredentials();
  const token = await signApiToken(creds);
  const baseUrl = getBaseUrl();

  const entries: AppleTransactionHistoryEntry[] = [];
  let revision: string | undefined;

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const url = new URL(
      `${baseUrl}/inApps/v1/history/${encodeURIComponent(originalTransactionId)}`,
    );
    if (revision) url.searchParams.set('revision', revision);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new AppStoreServerApiError(
        'HTTP_ERROR',
        `App Store Server API history request failed with status ${response.status}`,
        response.status,
      );
    }

    const body = historyResponseSchema.safeParse(await response.json());
    if (!body.success) {
      throw new AppStoreServerApiError(
        'INVALID_RESPONSE',
        'App Store Server API history response has an unexpected shape',
      );
    }

    for (const signed of body.data.signedTransactions ?? []) {
      entries.push(await normalizeTransaction(signed));
    }

    if (!body.data.hasMore) return entries;
    if (!body.data.revision) {
      throw new AppStoreServerApiError(
        'INVALID_RESPONSE',
        'App Store Server API history response has hasMore without a revision',
      );
    }
    revision = body.data.revision;
  }

  throw new AppStoreServerApiError(
    'TOO_MANY_PAGES',
    `App Store Server API history exceeded ${MAX_HISTORY_PAGES} pages`,
  );
}
