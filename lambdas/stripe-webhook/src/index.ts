import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import {
  createNotificationPublisher,
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
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { notifyStripeEvent } from './discord';
import { sendGa4ServerEvent } from './ga4';

// Initialize Rollbar on cold start
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// ── Module-scoped push publisher (reused across warm Lambda invocations) ─────
// NOTE: Requires sqs:SendMessage on the notifications queue in Terraform.
// Until the IAM policy is added, publish calls will fail with AccessDenied
// and degrade gracefully via the non-fatal catch blocks.
const pushPublisher = createNotificationPublisher();

// ── Secrets ──────────────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY_LOCAL = process.env['STRIPE_SECRET_KEY'] ?? '';
const STRIPE_SECRET_KEY_SECRET_NAME =
  process.env['STRIPE_SECRET_KEY_SECRET_NAME'] ?? '';
const STRIPE_WEBHOOK_SECRET_LOCAL = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
const STRIPE_WEBHOOK_SECRET_SECRET_NAME =
  process.env['STRIPE_WEBHOOK_SECRET_SECRET_NAME'] ?? '';

// ── Config ────────────────────────────────────────────────────────────────────

// Number of days a past_due user retains premium access while payment retries.
const GRACE_PERIOD_DAYS = parseInt(
  process.env['STRIPE_GRACE_PERIOD_DAYS'] ?? '7',
  10,
);

let stripeClientPromise: Promise<Stripe> | null = null;
let webhookSecretPromise: Promise<string> | null = null;

// Pinned Stripe API version. Without this, the SDK defaults to whatever
// version ships with the installed build — an SDK bump (e.g. dependabot) can
// silently change webhook payload shapes (`invoice.parent?.subscription_details`,
// `subscription.items.data[0]?.current_period_end`, event object typings) and
// break signature-verification leniency. To upgrade: read Stripe's API
// changelog, adjust any affected payload accesses, then bump this constant.
const STRIPE_API_VERSION = '2026-02-25.clover' as const;

function getStripeClient(): Promise<Stripe> {
  if (!stripeClientPromise) {
    stripeClientPromise = initStripeClient();
  }
  return stripeClientPromise;
}

async function initStripeClient(): Promise<Stripe> {
  if (STRIPE_SECRET_KEY_LOCAL)
    return new Stripe(STRIPE_SECRET_KEY_LOCAL, {
      apiVersion: STRIPE_API_VERSION,
    });
  if (!STRIPE_SECRET_KEY_SECRET_NAME)
    throw new Error(
      'Stripe secret key not configured: set STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_SECRET_NAME',
    );
  const key = await retrieveSecretParameterValue(STRIPE_SECRET_KEY_SECRET_NAME);
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
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

// Strict userId parser — rejects partial numeric strings like '123abc' that
// parseInt would silently coerce to 123.
function parseUserId(value: string | undefined | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Atomically claim a Stripe event for processing.
 *
 * Returns true if this invocation inserted the dedupe row (we own processing),
 * false if another invocation already claimed it. Closes the concurrent-delivery
 * race where two near-simultaneous retries would both see the event as unseen.
 */
async function claimStripeEvent(eventId: string): Promise<boolean> {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .insert(InternalSchema.stripeEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning({ eventId: InternalSchema.stripeEvents.eventId });
    return rows.length > 0;
  });
}

/**
 * Release a previously-claimed Stripe event so Stripe's retry will re-run it.
 * Used when processing throws after a successful claim — without this, the
 * dedupe row would short-circuit every retry and the event would be lost.
 */
async function releaseStripeEventClaim(eventId: string): Promise<void> {
  await runWithInternalClient(getDbOptions(), async (db) => {
    await db
      .delete(InternalSchema.stripeEvents)
      .where(eq(InternalSchema.stripeEvents.eventId, eventId));
  });
}

async function upsertSubscription(
  userId: number,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  status: string,
  currentPeriodEnd: Date | null,
  cancelAtPeriodEnd: boolean,
  trialEndsAt: Date | null,
): Promise<void> {
  const newTier = tierFromStatus(status);

  // Capture the previous tier before overwriting so we can detect direction
  // of change (premium → free or free → premium).
  const previousTier = await runWithInternalClient(
    getDbOptions(),
    async (db) => {
      const rows = await db
        .select({ tier: InternalSchema.subscriptions.tier })
        .from(InternalSchema.subscriptions)
        .where(
          eq(
            InternalSchema.subscriptions.stripeSubscriptionId,
            stripeSubscriptionId,
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
        stripeCustomerId,
        stripeSubscriptionId,
        status,
        tier: newTier,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        trialEndsAt,
      })
      .onConflictDoUpdate({
        target: InternalSchema.subscriptions.stripeSubscriptionId,
        set: {
          status,
          tier: newTier,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          trialEndsAt,
          updatedAt: new Date(),
        },
      });

    // Denormalize tier onto users table for fast resolver lookups
    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: newTier, updatedAt: new Date() })
      .where(eq(InternalSchema.usersInAppInternal.id, userId));
  });

  // Apply tier-change side effects (league freezes / feature conversions)
  await applyTierChangeSideEffects(userId, previousTier, newTier);
}

async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string,
): Promise<number | null> {
  const newTier = tierFromStatus(status);

  const result = await runWithInternalClient(getDbOptions(), async (db) => {
    const existing = await db
      .select({
        userId: InternalSchema.subscriptions.userId,
        tier: InternalSchema.subscriptions.tier,
      })
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

    const { userId, tier: previousTier } = existing[0];

    await db
      .update(InternalSchema.subscriptions)
      .set({ status, tier: newTier, updatedAt: new Date() })
      .where(
        eq(
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
        ),
      );

    // Denormalize tier onto users table
    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: newTier, updatedAt: new Date() })
      .where(eq(InternalSchema.usersInAppInternal.id, userId));

    return { userId, previousTier: previousTier as 'free' | 'premium' };
  });

  if (result === null) return null;

  const { userId, previousTier } = result;
  await applyTierChangeSideEffects(userId, previousTier, newTier);
  return userId;
}

// ── Tier-change side effects ──────────────────────────────────────────────────

/**
 * Apply league-level side effects when a user's subscription tier changes.
 *
 * - premium → free: run the downgrade handler (freeze excess leagues, convert
 *   salary-cap / FAAB-waiver settings)
 * - free → premium: clear any tier-based league freezes
 * - No change: no-op
 */
async function applyTierChangeSideEffects(
  userId: number,
  previousTier: 'free' | 'premium' | null,
  newTier: 'free' | 'premium',
): Promise<void> {
  if (previousTier === newTier) return;

  if (newTier === 'free') {
    LOGGER.info('Tier downgrade detected — applying downgrade restrictions', {
      userId,
      previousTier,
      newTier,
    });
    await handleSubscriptionDowngrade(userId, getDbOptions());
  } else if (newTier === 'premium' && previousTier === 'free') {
    LOGGER.info('Tier upgrade detected — clearing tier freezes', {
      userId,
      previousTier,
      newTier,
    });
    await clearLeagueTierFreezes(userId, getDbOptions());
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * Thrown when checkout.session.completed metadata cannot be verified against
 * the Stripe customer record or an existing subscription row. The top-level
 * handler catches this, logs to Rollbar, and returns 400 so the caller (or a
 * compromised client attempting metadata injection) is alerted and the side
 * effects of granting premium are skipped.
 */
class CheckoutOwnershipVerificationError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CheckoutOwnershipVerificationError';
  }
}

/**
 * Cross-check that the userId in session.metadata actually owns the Stripe
 * customer. Without this, anyone who can mint a checkout session with
 * arbitrary metadata (compromised API key, client-side checkout, misconfigured
 * endpoint) could credit another user with premium access.
 *
 * Two independent checks:
 *   1. The Stripe customer's metadata.userId must match session.metadata.userId.
 *      getOrCreateStripeCustomer always stamps this on customer creation, so a
 *      missing or mismatched value is a strong signal of tampering.
 *   2. If a subscription row already exists for this customer, its userId must
 *      match the session's userId. This protects against a scenario where an
 *      attacker reuses a legitimate customer ID but swaps the metadata.
 */
async function verifyCheckoutOwnership(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  sessionUserId: number,
  stripeCustomerId: string,
): Promise<void> {
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (customer.deleted) {
    throw new CheckoutOwnershipVerificationError(
      'Stripe customer is deleted — cannot verify ownership',
      { sessionId: session.id, stripeCustomerId, sessionUserId },
    );
  }

  const customerUserIdStr = customer.metadata?.['userId'];
  if (!customerUserIdStr) {
    throw new CheckoutOwnershipVerificationError(
      'Stripe customer is missing userId metadata — cannot verify ownership',
      { sessionId: session.id, stripeCustomerId, sessionUserId },
    );
  }

  const customerUserId = parseInt(customerUserIdStr, 10);
  if (isNaN(customerUserId) || customerUserId !== sessionUserId) {
    throw new CheckoutOwnershipVerificationError(
      'Session metadata userId does not match Stripe customer metadata userId',
      {
        sessionId: session.id,
        stripeCustomerId,
        sessionUserId,
        customerUserIdStr,
      },
    );
  }

  const existing = await runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select({ userId: InternalSchema.subscriptions.userId })
      .from(InternalSchema.subscriptions)
      .where(
        eq(InternalSchema.subscriptions.stripeCustomerId, stripeCustomerId),
      )
      .limit(1);
    return rows[0] ?? null;
  });

  if (existing && existing.userId !== sessionUserId) {
    throw new CheckoutOwnershipVerificationError(
      'Session metadata userId does not match existing subscription row for Stripe customer',
      {
        sessionId: session.id,
        stripeCustomerId,
        sessionUserId,
        existingUserId: existing.userId,
      },
    );
  }
}

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

  const userId = parseUserId(userIdStr);
  if (userId === null) {
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

  const stripe = await getStripeClient();

  // Verify the session's claimed userId actually owns the Stripe customer
  // before granting premium. Throws CheckoutOwnershipVerificationError on
  // mismatch; the top-level handler returns 400 + Rollbar alert.
  await verifyCheckoutOwnership(stripe, session, userId, stripeCustomerId);

  // Retrieve the subscription from Stripe to get current status / period end
  const subscription =
    await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const periodEnd = subscription.items.data[0]?.current_period_end;
  const trialEnd = subscription.trial_end;
  await upsertSubscription(
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    subscription.status,
    periodEnd ? new Date(periodEnd * 1000) : null,
    subscription.cancel_at_period_end,
    trialEnd ? new Date(trialEnd * 1000) : null,
  );

  LOGGER.info('Handled checkout.session.completed', {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    status: subscription.status,
  });

  await sendGa4ServerEvent(userId, 'subscription_started', {
    tier: 'premium',
    source: 'stripe',
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
    userId = parseUserId(userIdStr);
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
  const trialEnd = subscription.trial_end;
  await upsertSubscription(
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    subscription.status,
    periodEnd ? new Date(periodEnd * 1000) : null,
    subscription.cancel_at_period_end,
    trialEnd ? new Date(trialEnd * 1000) : null,
  );

  LOGGER.info('Handled subscription event', {
    userId,
    subscriptionId: subscription.id,
    status: subscription.status,
  });

  return userId;
}

// ── Payment failure / success (grace period) ─────────────────────────────────

/**
 * Handle invoice.payment_failed:
 * - On first failure, set grace_period_ends_at = now + GRACE_PERIOD_DAYS.
 * - Keep tier = premium while within the grace period.
 * - Downgrade to free once the grace period expires.
 */
async function handlePaymentFailed(
  stripeSubscriptionId: string,
): Promise<number | null> {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const existing = await db
      .select()
      .from(InternalSchema.subscriptions)
      .where(
        eq(
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      LOGGER.warn('No subscription record found for invoice.payment_failed', {
        stripeSubscriptionId,
      });
      return null;
    }

    const record = existing[0];
    const now = new Date();
    // Set grace period on the first failure only (don't reset on retries).
    const gracePeriodEndsAt =
      record.gracePeriodEndsAt ??
      new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const withinGracePeriod = gracePeriodEndsAt > now;
    const tier: 'free' | 'premium' = withinGracePeriod ? 'premium' : 'free';

    await db
      .update(InternalSchema.subscriptions)
      .set({ status: 'past_due', tier, gracePeriodEndsAt, updatedAt: now })
      .where(
        eq(
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
        ),
      );

    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: tier, updatedAt: now })
      .where(eq(InternalSchema.usersInAppInternal.id, record.userId));

    if (withinGracePeriod) {
      LOGGER.info('Payment failed — user retains premium during grace period', {
        userId: record.userId,
        gracePeriodEndsAt,
      });
    } else {
      LOGGER.info('Grace period expired — user downgraded to free tier', {
        userId: record.userId,
        gracePeriodEndsAt,
      });
    }

    return record.userId;
  });
}

/**
 * Handle invoice.payment_succeeded:
 * - Mark subscription as active.
 * - Clear grace_period_ends_at (payment resolved).
 */
async function handlePaymentSucceeded(
  stripeSubscriptionId: string,
): Promise<number | null> {
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
      LOGGER.warn(
        'No subscription record found for invoice.payment_succeeded',
        {
          stripeSubscriptionId,
        },
      );
      return null;
    }

    const { userId } = existing[0];
    const now = new Date();

    await db
      .update(InternalSchema.subscriptions)
      .set({
        status: 'active',
        tier: 'premium',
        gracePeriodEndsAt: null,
        updatedAt: now,
      })
      .where(
        eq(
          InternalSchema.subscriptions.stripeSubscriptionId,
          stripeSubscriptionId,
        ),
      );

    await db
      .update(InternalSchema.usersInAppInternal)
      .set({ subscriptionTier: 'premium', updatedAt: now })
      .where(eq(InternalSchema.usersInAppInternal.id, userId));

    LOGGER.info('Payment succeeded — subscription restored to active', {
      userId,
      stripeSubscriptionId,
    });

    return userId;
  });
}

/**
 * Handle customer.subscription.trial_will_end (fires ~3 days before trial ends):
 * - Look up the user from the subscription record.
 * - Push a TRIAL_WILL_END WebSocket notification with the trial end timestamp.
 */
async function handleTrialWillEnd(
  subscription: Stripe.Subscription,
): Promise<number | null> {
  const stripeSubscriptionId = subscription.id;
  const trialEnd = subscription.trial_end;
  const trialEndsAt = trialEnd ? new Date(trialEnd * 1000) : null;

  const userIdStr = subscription.metadata?.['userId'];
  let userId: number | null = parseUserId(userIdStr);

  if (userId === null) {
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
      LOGGER.warn('No subscription record found for trial_will_end event', {
        stripeSubscriptionId,
      });
      return null;
    }
  }

  LOGGER.info('Trial will end soon — sending reminder', {
    userId,
    stripeSubscriptionId,
    trialEndsAt,
  });

  const notificationService = createNotificationService();
  if (notificationService && trialEndsAt) {
    try {
      await notificationService.notifyTrialWillEnd(
        userId,
        trialEndsAt.toISOString(),
      );
    } catch (err) {
      LOGGER.warn('Trial will end notification failed (non-fatal)', {
        err,
        userId,
      });
    }
  }

  // Push notification for trial ending
  if (pushPublisher && trialEndsAt) {
    try {
      await pushPublisher.publish({
        userId,
        notificationType: 'trial_will_end',
        title: 'Trial Ending Soon',
        body: `Your free trial ends on ${trialEndsAt.toLocaleDateString()}. Upgrade to keep Premium features!`,
      });
    } catch (err) {
      LOGGER.warn('Trial will end push notification failed (non-fatal)', {
        err,
        userId,
      });
    }
  }

  return userId;
}

// ── Notification helper ───────────────────────────────────────────────────────

async function pushSubscriptionUpdated(
  userId: number,
  stripeSubscriptionId: string,
): Promise<void> {
  const notificationService = createNotificationService();

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

  if (notificationService) {
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

  // Push notification for subscription change
  if (pushPublisher) {
    try {
      const tierLabel = sub.tier === 'premium' ? 'Premium' : 'Free';
      await pushPublisher.publish({
        userId,
        notificationType: 'subscription_updated',
        title: 'Subscription Updated',
        body: `Your subscription has been updated to ${tierLabel}.`,
      });
    } catch (err) {
      LOGGER.warn('Push subscription notification failed (non-fatal)', {
        err,
        userId,
      });
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

const baseStripeWebhookHandler = async (
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

  // Idempotency: atomically claim the event before running any side effects.
  // If claimStripeEvent returns false, another invocation already claimed it
  // (concurrent Stripe retry) — acknowledge and exit without re-processing.
  const claimed = await claimStripeEvent(stripeEvent.id);
  if (!claimed) {
    LOGGER.info('Stripe event already claimed — skipping', {
      eventId: stripeEvent.id,
    });
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  let userId: number | null = null;
  let subscriptionId: string | null = null;
  let customerId: string | null = null;
  let subscriptionStatus: string | null = null;
  let invoiceAmount: number | null = null;
  let invoiceCurrency: string | null = null;

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        userId = await handleCheckoutSessionCompleted(session);
        subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : null;
        customerId =
          typeof session.customer === 'string' ? session.customer : null;
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = stripeEvent.data.object;
        // Notification is pushed directly inside handleTrialWillEnd;
        // leave subscriptionId null to skip the generic pushSubscriptionUpdated.
        userId = await handleTrialWillEnd(sub);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object;
        userId = await handleSubscriptionEvent(sub);
        subscriptionId = sub.id;
        customerId = typeof sub.customer === 'string' ? sub.customer : null;
        subscriptionStatus = sub.status;
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        userId = await updateSubscriptionStatus(sub.id, 'canceled');
        subscriptionId = sub.id;
        customerId = typeof sub.customer === 'string' ? sub.customer : null;
        subscriptionStatus = 'canceled';
        if (userId !== null) {
          await sendGa4ServerEvent(userId, 'subscription_cancelled', {
            tier: 'premium',
            source: 'stripe',
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object;
        const rawSub = invoice.parent?.subscription_details?.subscription;
        const invoiceSubId =
          typeof rawSub === 'string' ? rawSub : (rawSub?.id ?? null);
        if (invoiceSubId) {
          userId = await handlePaymentSucceeded(invoiceSubId);
          subscriptionId = invoiceSubId;
        }
        customerId =
          typeof invoice.customer === 'string' ? invoice.customer : null;
        invoiceAmount = invoice.amount_paid ?? null;
        invoiceCurrency = invoice.currency ?? null;
        // Fire subscription_renewed for recurring payments only — the initial
        // payment is already covered by checkout.session.completed.
        if (
          userId !== null &&
          invoice.billing_reason === 'subscription_cycle'
        ) {
          await sendGa4ServerEvent(userId, 'subscription_renewed', {
            tier: 'premium',
            source: 'stripe',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        const rawSub = invoice.parent?.subscription_details?.subscription;
        const invoiceSubId =
          typeof rawSub === 'string' ? rawSub : (rawSub?.id ?? null);
        if (invoiceSubId) {
          userId = await handlePaymentFailed(invoiceSubId);
          subscriptionId = invoiceSubId;
        }
        customerId =
          typeof invoice.customer === 'string' ? invoice.customer : null;
        invoiceAmount = invoice.amount_due ?? null;
        invoiceCurrency = invoice.currency ?? null;
        break;
      }

      case 'charge.refunded': {
        const charge = stripeEvent.data.object;
        const chargeCustomerId =
          typeof charge.customer === 'string' ? charge.customer : null;
        if (chargeCustomerId) {
          const existing = await runWithInternalClient(
            getDbOptions(),
            async (db) => {
              const rows = await db
                .select({ userId: InternalSchema.subscriptions.userId })
                .from(InternalSchema.subscriptions)
                .where(
                  eq(
                    InternalSchema.subscriptions.stripeCustomerId,
                    chargeCustomerId,
                  ),
                )
                .limit(1);
              return rows[0] ?? null;
            },
          );
          if (existing) {
            userId = existing.userId;
            const transactionId =
              typeof charge.payment_intent === 'string'
                ? charge.payment_intent
                : charge.id;
            await sendGa4ServerEvent(userId, 'refund', {
              transaction_id: transactionId,
              value: (charge.amount_refunded ?? 0) / 100,
              currency: (charge.currency ?? 'usd').toUpperCase(),
            });
          }
        }
        break;
      }

      default:
        LOGGER.info('Unhandled Stripe event type — acknowledged', {
          eventType: stripeEvent.type,
        });
    }
  } catch (err) {
    if (err instanceof CheckoutOwnershipVerificationError) {
      LOGGER.error(
        'Checkout ownership verification failed — rejecting event',
        err,
        {
          eventId: stripeEvent.id,
          eventType: stripeEvent.type,
          tags: {
            lambda: 'stripe-webhook',
            eventType: stripeEvent.type,
            reason: 'ownership_verification_failed',
          },
          ...err.context,
        },
      );
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Ownership verification failed' }),
      };
    }
    LOGGER.error(
      'Error processing Stripe webhook event',
      err instanceof Error ? err : new Error(String(err)),
      {
        eventId: stripeEvent.id,
        eventType: stripeEvent.type,
        // tags and extra are nested under logArgs in RollbarOutputDestination
        tags: { lambda: 'stripe-webhook', eventType: stripeEvent.type },
        ...(!(err instanceof Error) && { originalError: err }),
      },
    );
    // Release the claim so Stripe's retry re-runs this event. If the release
    // itself fails, log and fall through — a stuck claim for a failed event is
    // the lesser evil compared to silently dropping the 500 response.
    try {
      await releaseStripeEventClaim(stripeEvent.id);
    } catch (releaseErr) {
      LOGGER.error(
        'Failed to release Stripe event claim after processing error — event may be stuck in dedupe table',
        releaseErr instanceof Error
          ? releaseErr
          : new Error(String(releaseErr)),
        {
          eventId: stripeEvent.id,
          tags: { lambda: 'stripe-webhook', eventType: stripeEvent.type },
        },
      );
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }

  // Push real-time tier update to the user's WebSocket connections.
  // Non-fatal: a notification failure must never cause a 500 that triggers a
  // Stripe retry.
  if (userId !== null && subscriptionId !== null) {
    try {
      await pushSubscriptionUpdated(userId, subscriptionId);
    } catch (err) {
      LOGGER.warn('pushSubscriptionUpdated failed (non-fatal)', {
        err,
        userId,
        subscriptionId,
      });
    }
  }

  // Discord notification — awaited with a timeout so the Lambda runtime
  // doesn't freeze and drop the in-flight fetch.  Errors are swallowed to
  // keep the webhook response unaffected.
  try {
    await Promise.race([
      notifyStripeEvent({
        eventType: stripeEvent.type,
        customerId,
        subscriptionId,
        userId,
        status: subscriptionStatus,
        amount: invoiceAmount,
        currency: invoiceCurrency,
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
  } catch {
    // Intentionally swallowed — notifyStripeEvent already logs internally.
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

export const handler = withRollbar(baseStripeWebhookHandler);
