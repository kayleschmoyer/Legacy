/**
 * Apple IAP Lambda
 *
 * Handles App Store Server Notifications v2 from Apple.
 * Apple sends JWS-signed POST requests to this endpoint whenever a
 * subscription event occurs (new subscription, renewal, cancellation, etc.).
 *
 * Docs: https://developer.apple.com/documentation/appstoreservernotifications
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import {
  createNotificationService,
  retrieveSecretParameterValue,
} from '@legacy-sports/aws-utils';
import {
  clearLeagueTierFreezes,
  handleSubscriptionDowngrade,
  InternalSchema,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { decodeAndVerifyJws } from './jws';
import {
  assertNotificationEnvironment,
  parseExpectedAppleEnvironment,
} from './environment';
import { sendGa4ServerEvent } from './ga4';
import type { AppStoreNotification, NotificationType } from './types';

const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// ── Config ────────────────────────────────────────────────────────────────────

const BUNDLE_ID_LOCAL = process.env['APPLE_BUNDLE_ID'] ?? '';
const BUNDLE_ID_SECRET_NAME = process.env['APPLE_BUNDLE_ID_SECRET_NAME'] ?? '';
const EXPECTED_APPLE_ENVIRONMENT = parseExpectedAppleEnvironment(
  process.env['EXPECTED_APPLE_ENVIRONMENT'],
);

let bundleIdPromise: Promise<string> | null = null;

function getBundleId(): Promise<string> {
  if (!bundleIdPromise) {
    bundleIdPromise = resolveBundleId();
  }
  return bundleIdPromise;
}

async function resolveBundleId(): Promise<string> {
  if (BUNDLE_ID_LOCAL) return BUNDLE_ID_LOCAL;
  if (!BUNDLE_ID_SECRET_NAME) {
    throw new Error(
      'Apple bundle ID not configured: set APPLE_BUNDLE_ID or APPLE_BUNDLE_ID_SECRET_NAME',
    );
  }
  return retrieveSecretParameterValue(BUNDLE_ID_SECRET_NAME);
}

// ── Tier helper ───────────────────────────────────────────────────────────────

function tierFromNotificationType(
  notificationType: NotificationType,
  subtype?: string,
): 'free' | 'premium' {
  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'DID_RECOVER':
    case 'OFFER_REDEEMED':
      return 'premium';
    case 'DID_FAIL_TO_RENEW':
      // Keep premium during grace period (grace period is tracked separately)
      return subtype === 'GRACE_PERIOD' ? 'premium' : 'free';
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
    case 'REFUND':
    case 'REVOKE':
      return 'free';
    default:
      return 'free';
  }
}

function statusFromNotificationType(
  notificationType: NotificationType,
): string {
  switch (notificationType) {
    case 'SUBSCRIBED':
      return 'active';
    case 'DID_RENEW':
    case 'DID_RECOVER':
      return 'active';
    case 'DID_FAIL_TO_RENEW':
      return 'past_due';
    case 'EXPIRED':
      return 'canceled';
    case 'GRACE_PERIOD_EXPIRED':
      return 'canceled';
    case 'REFUND':
    case 'REVOKE':
      return 'canceled';
    case 'OFFER_REDEEMED':
      return 'active';
    default:
      return 'inactive';
  }
}

// ── Idempotency ───────────────────────────────────────────────────────────────

async function isEventProcessed(eventId: string): Promise<boolean> {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select()
      .from(InternalSchema.appleEvents)
      .where(eq(InternalSchema.appleEvents.eventId, eventId))
      .limit(1);
    return rows.length > 0;
  });
}

async function recordEvent(eventId: string): Promise<void> {
  await runWithInternalClient(getDbOptions(), async (db) => {
    await db
      .insert(InternalSchema.appleEvents)
      .values({ eventId })
      .onConflictDoNothing();
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function upsertAppleSubscription(
  userId: number,
  originalTransactionId: string,
  productId: string,
  status: string,
  tier: 'free' | 'premium',
  currentPeriodEnd: Date | null,
): Promise<void> {
  const previousTier = await runWithInternalClient(
    getDbOptions(),
    async (db) => {
      const rows = await db
        .select({ tier: InternalSchema.subscriptions.tier })
        .from(InternalSchema.subscriptions)
        .where(
          eq(
            InternalSchema.subscriptions.appleOriginalTransactionId,
            originalTransactionId,
          ),
        )
        .limit(1);
      return (rows[0]?.tier ?? null) as 'free' | 'premium' | null;
    },
  );

  await runWithInternalClient(getDbOptions(), async (db) => {
    await db
      .insert(InternalSchema.subscriptions)
      .values({
        userId,
        appleOriginalTransactionId: originalTransactionId,
        appleProductId: productId,
        status,
        tier,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      })
      .onConflictDoUpdate({
        target: InternalSchema.subscriptions.appleOriginalTransactionId,
        set: {
          appleProductId: productId,
          status,
          tier,
          currentPeriodEnd,
          updatedAt: new Date(),
        },
      });

    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: tier, updatedAt: new Date() })
      .where(eq(InternalSchema.usersInAppInternal.id, userId));
  });

  await applyTierChangeSideEffects(userId, previousTier, tier);
}

async function findUserIdByOriginalTransactionId(
  originalTransactionId: string,
): Promise<number | null> {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select({ userId: InternalSchema.subscriptions.userId })
      .from(InternalSchema.subscriptions)
      .where(
        eq(
          InternalSchema.subscriptions.appleOriginalTransactionId,
          originalTransactionId,
        ),
      )
      .limit(1);
    return rows[0]?.userId ?? null;
  });
}

// ── Tier-change side effects ──────────────────────────────────────────────────

async function applyTierChangeSideEffects(
  userId: number,
  previousTier: 'free' | 'premium' | null,
  newTier: 'free' | 'premium',
): Promise<void> {
  if (previousTier === newTier) return;

  if (newTier === 'free') {
    LOGGER.info('Apple IAP — tier downgrade detected', {
      userId,
      previousTier,
      newTier,
    });
    await handleSubscriptionDowngrade(userId, getDbOptions());
  } else if (newTier === 'premium' && previousTier === 'free') {
    LOGGER.info('Apple IAP — tier upgrade detected', {
      userId,
      previousTier,
      newTier,
    });
    await clearLeagueTierFreezes(userId, getDbOptions());
  }
}

// ── Notification handler ──────────────────────────────────────────────────────

async function handleNotification(
  notification: AppStoreNotification,
): Promise<number | null> {
  const { notificationType, subtype, data } = notification;
  const transactionInfo = data.signedTransactionInfo;

  const { originalTransactionId, productId, expiresDate } = transactionInfo;

  // Look up the userId from the existing subscription row (set by verifyApplePurchase
  // when the user first purchased on device). If the row doesn't exist yet (race
  // condition where the ASN arrives before the client calls verifyApplePurchase),
  // we log a warning and skip — the client mutation will set it shortly after.
  const userId = await findUserIdByOriginalTransactionId(originalTransactionId);

  if (userId === null) {
    LOGGER.warn(
      'Apple IAP — cannot determine userId for notification; skipping',
      {
        notificationType,
        originalTransactionId,
      },
    );
    return null;
  }

  const tier = tierFromNotificationType(notificationType, subtype);
  const status = statusFromNotificationType(notificationType);
  const currentPeriodEnd = expiresDate ? new Date(expiresDate) : null;

  await upsertAppleSubscription(
    userId,
    originalTransactionId,
    productId,
    status,
    tier,
    currentPeriodEnd,
  );

  LOGGER.info('Apple IAP — processed notification', {
    notificationType,
    subtype,
    userId,
    originalTransactionId,
    status,
    tier,
  });

  // Fire GA4 Measurement Protocol events for subscription lifecycle changes.
  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'OFFER_REDEEMED':
      await sendGa4ServerEvent(userId, 'subscription_started', {
        tier: 'premium',
        source: 'apple_iap',
      });
      break;
    case 'DID_RENEW':
    case 'DID_RECOVER':
      await sendGa4ServerEvent(userId, 'subscription_renewed', {
        tier: 'premium',
        source: 'apple_iap',
      });
      break;
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
    case 'REFUND':
    case 'REVOKE':
      await sendGa4ServerEvent(userId, 'subscription_cancelled', {
        tier: 'premium',
        source: 'apple_iap',
      });
      break;
  }

  return userId;
}

// ── WebSocket push ────────────────────────────────────────────────────────────

async function pushSubscriptionUpdated(
  userId: number,
  originalTransactionId: string,
): Promise<void> {
  const notificationService = createNotificationService();
  if (!notificationService) return;

  const sub = await runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select({
        tier: InternalSchema.subscriptions.tier,
        status: InternalSchema.subscriptions.status,
      })
      .from(InternalSchema.subscriptions)
      .where(
        eq(
          InternalSchema.subscriptions.appleOriginalTransactionId,
          originalTransactionId,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });

  if (!sub) return;

  try {
    await notificationService.notifySubscriptionUpdated(
      userId,
      sub.tier as 'free' | 'premium',
      sub.status,
    );
  } catch (err) {
    LOGGER.warn(
      'Apple IAP — WebSocket subscription notification failed (non-fatal)',
      {
        err,
        userId,
      },
    );
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

const baseAppleIapHandler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : (event.body ?? '');

  if (!rawBody) {
    LOGGER.warn('Apple IAP — received empty body');
    return { statusCode: 400, body: JSON.stringify({ error: 'Empty body' }) };
  }

  // Parse the outer payload to extract signedPayload
  let outerPayload: { signedPayload?: string };
  try {
    outerPayload = JSON.parse(rawBody) as { signedPayload?: string };
  } catch {
    LOGGER.warn('Apple IAP — failed to parse request body as JSON');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { signedPayload } = outerPayload;
  if (!signedPayload) {
    LOGGER.warn('Apple IAP — missing signedPayload in request body');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing signedPayload' }),
    };
  }

  // Decode and verify the JWS-signed notification
  let notification: AppStoreNotification;
  try {
    const bundleId = await getBundleId();
    notification = await decodeAndVerifyJws(signedPayload, bundleId);
  } catch (err) {
    LOGGER.warn('Apple IAP — JWS verification failed', { err });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JWS signature' }),
    };
  }

  LOGGER.info('Apple IAP — received notification', {
    notificationUUID: notification.notificationUUID,
    notificationType: notification.notificationType,
    subtype: notification.subtype,
  });

  // Reject notifications signed for a different App Store environment.
  // A sandbox-signed notification accepted by the production lambda would let
  // anyone with a sandbox Apple account grant/revoke premium on a real user's
  // originalTransactionId.
  try {
    assertNotificationEnvironment(
      notification.data.environment,
      EXPECTED_APPLE_ENVIRONMENT,
    );
  } catch (err) {
    LOGGER.warn('Apple IAP — rejecting notification from wrong environment', {
      notificationUUID: notification.notificationUUID,
      notificationType: notification.notificationType,
      actualEnvironment: notification.data.environment,
      expectedEnvironment: EXPECTED_APPLE_ENVIRONMENT,
      err,
    });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Environment mismatch' }),
    };
  }

  // Idempotency check
  const alreadyProcessed = await isEventProcessed(
    notification.notificationUUID,
  );
  if (alreadyProcessed) {
    LOGGER.info('Apple IAP — notification already processed — skipping', {
      notificationUUID: notification.notificationUUID,
    });
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  let userId: number | null = null;
  const originalTransactionId =
    notification.data.signedTransactionInfo.originalTransactionId;

  try {
    userId = await handleNotification(notification);
  } catch (err) {
    captureError(err instanceof Error ? err : new Error(String(err)), {
      tags: {
        lambda: 'apple-iap',
        notificationType: notification.notificationType,
      },
    });
    LOGGER.error('Apple IAP — error processing notification', {
      notificationUUID: notification.notificationUUID,
      notificationType: notification.notificationType,
      err,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }

  await recordEvent(notification.notificationUUID);

  if (userId !== null) {
    await pushSubscriptionUpdated(userId, originalTransactionId);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

export const handler = withRollbar(baseAppleIapHandler);
