import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import {
  createNotificationService,
  retrieveSecretParameterValue,
} from '@legacy-sports/aws-utils';
import {
  InternalSchema,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
} from '@legacy-sports/rollbar';

// Initialize Sentry on cold start
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// ── Secrets ──────────────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY_LOCAL = process.env['STRIPE_SECRET_KEY'] ?? '';
const STRIPE_SECRET_KEY_SECRET_NAME =
  process.env['STRIPE_SECRET_KEY_SECRET_NAME'] ?? '';
const STRIPE_WEBHOOK_SECRET_LOCAL = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
const STRIPE_WEBHOOK_SECRET_SECRET_NAME =
  process.env['STRIPE_WEBHOOK_SECRET_SECRET_NAME'] ?? '';

let stripeClientPromise: Promise<Stripe> | null = null;
let webhookSecretPromise: Promise<string> | null = null;

function getStripeClient(): Promise<Stripe> {
  if (!stripeClientPromise) {
    stripeClientPromise = initStripeClient();
  }
  return stripeClientPromise;
}

async function initStripeClient(): Promise<Stripe> {
  if (STRIPE_SECRET_KEY_LOCAL) return new Stripe(STRIPE_SECRET_KEY_LOCAL);
  if (!STRIPE_SECRET_KEY_SECRET_NAME)
    throw new Error(
      'Stripe secret key not configured: set STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_SECRET_NAME',
    );
  const key = await retrieveSecretParameterValue(STRIPE_SECRET_KEY_SECRET_NAME);
  return new Stripe(key);
}

function getWebhookSecret(): Promise<string> {
  if (!webhookSecretPromise) {
    webhookSecretPromise = resolveWebhookSecret();
  }
  return webhookSecretPromise;
}

async function resolveWebhookSecret(): Promise<string> {
  if (STRIPE_WEBHOOK_SECRET_LOCAL) return STRIPE_WEBHOOK_SECRET_LOCAL;
  if (!STRIPE_WEBHOOK_SECRET_SECRET_NAME)
    throw new Error(
      'Stripe webhook secret not configured: set STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET_SECRET_NAME',
    );
  return retrieveSecretParameterValue(STRIPE_WEBHOOK_SECRET_SECRET_NAME);
}

// ── Tier helper ───────────────────────────────────────────────────────────────

function tierFromStatus(status: string): 'free' | 'premium' {
  return status === 'active' || status === 'trialing' ? 'premium' : 'free';
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function isEventProcessed(eventId: string): Promise<boolean> {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select()
      .from(InternalSchema.stripeEvents)
      .where(eq(InternalSchema.stripeEvents.eventId, eventId))
      .limit(1);
    return rows.length > 0;
  });
}

async function recordEvent(eventId: string): Promise<void> {
  await runWithInternalClient(getDbOptions(), async (db) => {
    await db
      .insert(InternalSchema.stripeEvents)
      .values({ eventId })
      .onConflictDoNothing();
  });
}

async function upsertSubscription(
  userId: number,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  status: string,
  currentPeriodEnd: Date | null,
  cancelAtPeriodEnd: boolean,
): Promise<void> {
  const tier = tierFromStatus(status);
  await runWithInternalClient(getDbOptions(), async (db) => {
    await db
      .insert(InternalSchema.subscriptions)
      .values({
        userId,
        stripeCustomerId,
        stripeSubscriptionId,
        status,
        tier,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      })
      .onConflictDoUpdate({
        target: InternalSchema.subscriptions.stripeSubscriptionId,
        set: {
          status,
          tier,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      });

    // Denormalize tier onto users table for fast resolver lookups
    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: tier, updatedAt: new Date() })
      .where(eq(InternalSchema.usersInAppInternal.id, userId));
  });
}

async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string,
): Promise<number | null> {
  const tier = tierFromStatus(status);
  return runWithInternalClient(getDbOptions(), async (db) => {
    const existing = await db
      .select({ userId: InternalSchema.subscriptions.userId })
      .from(InternalSchema.subscriptions)
      .where(
        eq(
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      LOGGER.warn('No subscription record found for subscription ID', {
        stripeSubscriptionId,
      });
      return null;
    }

    const { userId } = existing[0];

    await db
      .update(InternalSchema.subscriptions)
      .set({ status, tier, updatedAt: new Date() })
      .where(
        eq(
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
        ),
      );

    // Denormalize tier onto users table
    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: tier, updatedAt: new Date() })
      .where(eq(InternalSchema.usersInAppInternal.id, userId));

    return userId;
  });
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<number | null> {
  const userIdStr = session.metadata?.['userId'];
  if (!userIdStr) {
    LOGGER.warn(
      'checkout.session.completed missing userId in metadata — skipping',
      { sessionId: session.id },
    );
    return null;
  }

  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) {
    LOGGER.warn('checkout.session.completed has invalid userId in metadata', {
      sessionId: session.id,
      userIdStr,
    });
    return null;
  }

  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : null;
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : null;

  if (!stripeCustomerId || !stripeSubscriptionId) {
    LOGGER.warn(
      'checkout.session.completed missing customer or subscription ID',
      { sessionId: session.id },
    );
    return null;
  }

  // Retrieve the subscription from Stripe to get current status / period end
  const stripe = await getStripeClient();
  const subscription =
    await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const periodEnd = subscription.items.data[0]?.current_period_end;
  await upsertSubscription(
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    subscription.status,
    periodEnd ? new Date(periodEnd * 1000) : null,
    subscription.cancel_at_period_end,
  );

  LOGGER.info('Handled checkout.session.completed', {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    status: subscription.status,
  });

  return userId;
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
): Promise<number | null> {
  const userIdStr = subscription.metadata?.['userId'];
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : null;
  const stripeSubscriptionId = subscription.id;

  if (!stripeCustomerId) {
    LOGGER.warn('Subscription event missing customer ID', {
      subscriptionId: subscription.id,
    });
    return null;
  }

  // If userId isn't in the subscription metadata, look it up from existing record
  let userId: number | null = null;

  if (userIdStr) {
    userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) userId = null;
  }

  if (userId === null) {
    // Attempt to find userId from existing subscription record
    const existing = await runWithInternalClient(getDbOptions(), async (db) => {
      const rows = await db
        .select({ userId: InternalSchema.subscriptions.userId })
        .from(InternalSchema.subscriptions)
        .where(
          eq(
            InternalSchema.subscriptions.stripeSubscriptionId,
            stripeSubscriptionId,
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    if (existing) {
      userId = existing.userId;
    } else {
      LOGGER.warn(
        'Cannot determine userId for subscription event — no existing record and no metadata',
        { subscriptionId: subscription.id },
      );
      return null;
    }
  }

  const periodEnd = subscription.items.data[0]?.current_period_end;
  await upsertSubscription(
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    subscription.status,
    periodEnd ? new Date(periodEnd * 1000) : null,
    subscription.cancel_at_period_end,
  );

  LOGGER.info('Handled subscription event', {
    userId,
    subscriptionId: subscription.id,
    status: subscription.status,
  });

  return userId;
}

// ── Notification helper ───────────────────────────────────────────────────────

async function pushSubscriptionUpdated(
  userId: number,
  stripeSubscriptionId: string,
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
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
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
    LOGGER.warn('WebSocket subscription notification failed (non-fatal)', {
      err,
      userId,
    });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const signature = event.headers['stripe-signature'] ?? '';
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : (event.body ?? '');

  // Verify signature
  let stripeEvent: Stripe.Event;
  try {
    const stripe = await getStripeClient();
    const webhookSecret = await getWebhookSecret();
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    LOGGER.warn('Stripe webhook signature verification failed', { err });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid signature' }),
    };
  }

  LOGGER.info('Received Stripe webhook event', {
    eventId: stripeEvent.id,
    eventType: stripeEvent.type,
  });

  // Idempotency check
  const alreadyProcessed = await isEventProcessed(stripeEvent.id);
  if (alreadyProcessed) {
    LOGGER.info('Stripe event already processed — skipping', {
      eventId: stripeEvent.id,
    });
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  let userId: number | null = null;
  let subscriptionId: string | null = null;

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        userId = await handleCheckoutSessionCompleted(session);
        subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : null;
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object;
        userId = await handleSubscriptionEvent(sub);
        subscriptionId = sub.id;
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        userId = await updateSubscriptionStatus(sub.id, 'canceled');
        subscriptionId = sub.id;
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object;
        const rawSub = invoice.parent?.subscription_details?.subscription;
        const invoiceSubId =
          typeof rawSub === 'string' ? rawSub : (rawSub?.id ?? null);
        if (invoiceSubId) {
          userId = await updateSubscriptionStatus(invoiceSubId, 'active');
          subscriptionId = invoiceSubId;
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        const rawSub = invoice.parent?.subscription_details?.subscription;
        const invoiceSubId =
          typeof rawSub === 'string' ? rawSub : (rawSub?.id ?? null);
        if (invoiceSubId) {
          userId = await updateSubscriptionStatus(invoiceSubId, 'past_due');
          subscriptionId = invoiceSubId;
        }
        break;
      }

      default:
        LOGGER.info('Unhandled Stripe event type — acknowledged', {
          eventType: stripeEvent.type,
        });
    }
  } catch (err) {
    captureError(err instanceof Error ? err : new Error(String(err)), {
      tags: { lambda: 'stripe-webhook', eventType: stripeEvent.type },
    });
    LOGGER.error('Error processing Stripe webhook event', {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
      err,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }

  // Record event as processed (idempotency)
  await recordEvent(stripeEvent.id);

  // Push real-time tier update to the user's WebSocket connections
  if (userId !== null && subscriptionId !== null) {
    await pushSubscriptionUpdated(userId, subscriptionId);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
