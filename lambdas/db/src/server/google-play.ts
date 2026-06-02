import { type AuthClient, GoogleAuth } from 'google-auth-library';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import '../env';

const SERVICE_ACCOUNT_KEY_LOCAL =
  process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON'] ?? '';
const SERVICE_ACCOUNT_KEY_SECRET_NAME =
  process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_SECRET_NAME'] ?? '';

// Validate credentials at module load time so misconfigurations surface in
// Lambda cold-start logs rather than only at the first API call.
if (!SERVICE_ACCOUNT_KEY_LOCAL && !SERVICE_ACCOUNT_KEY_SECRET_NAME) {
  LOGGER.warn(
    'Google Play service account not configured: ' +
      'set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON or ' +
      'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_SECRET_NAME. ' +
      'Calls to fetchGoogleSubscription will throw at runtime.',
  );
} else if (SERVICE_ACCOUNT_KEY_LOCAL) {
  // The inline key is available synchronously — validate it now so a
  // malformed value fails fast instead of crashing the first API request.
  try {
    const parsed: unknown = JSON.parse(SERVICE_ACCOUNT_KEY_LOCAL);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['client_email'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['private_key'] !== 'string'
    ) {
      LOGGER.warn(
        'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON is set but missing required ' +
          'client_email or private_key fields. ' +
          'Calls to fetchGoogleSubscription will fail at runtime.',
      );
    }
  } catch {
    LOGGER.warn(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON is set but contains invalid JSON. ' +
        'Calls to fetchGoogleSubscription will fail at runtime.',
    );
  }
}

export const GOOGLE_PLAY_PACKAGE_NAME =
  process.env['GOOGLE_PLAY_PACKAGE_NAME'] ?? 'com.legacySports';

type SubscriptionState =
  | 'SUBSCRIPTION_STATE_UNSPECIFIED'
  | 'SUBSCRIPTION_STATE_PENDING'
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED';

export interface SubscriptionPurchaseV2 {
  subscriptionState: SubscriptionState;
  startTime?: string;
  linkedPurchaseToken?: string;
  latestOrderId?: string;
  lineItems?: Array<{
    productId: string;
    expiryTime?: string;
  }>;
}

let authClientPromise: Promise<AuthClient> | null = null;

function getGoogleAuthClient(): Promise<AuthClient> {
  if (!authClientPromise) {
    authClientPromise = initGoogleAuthClient();
  }
  return authClientPromise;
}

async function initGoogleAuthClient(): Promise<AuthClient> {
  let keyJson: string;

  if (SERVICE_ACCOUNT_KEY_LOCAL) {
    keyJson = SERVICE_ACCOUNT_KEY_LOCAL;
  } else if (SERVICE_ACCOUNT_KEY_SECRET_NAME) {
    keyJson = await retrieveSecretParameterValue(
      SERVICE_ACCOUNT_KEY_SECRET_NAME,
    );
  } else {
    throw new Error(
      'Google Play service account not configured: set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_SECRET_NAME',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(keyJson);
  } catch {
    throw new Error(
      'Google Play service account key is not valid JSON. ' +
        'Verify GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON or the Secrets Manager secret value.',
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['client_email'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['private_key'] !== 'string'
  ) {
    throw new Error(
      'Google Play service account key JSON must contain client_email and private_key string fields',
    );
  }
  const credentials = parsed as { client_email: string; private_key: string };

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  return auth.getClient();
}

const ANDROID_PUBLISHER_BASE =
  'https://androidpublisher.googleapis.com/androidpublisher/v3';

export async function fetchGoogleSubscription(
  packageName: string,
  purchaseToken: string,
): Promise<SubscriptionPurchaseV2> {
  const client = await getGoogleAuthClient();
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await client.request<SubscriptionPurchaseV2>({ url });
  return response.data;
}

export function isActiveGoogleSubscription(
  sub: SubscriptionPurchaseV2,
): boolean {
  return (
    sub.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' ||
    sub.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  );
}
