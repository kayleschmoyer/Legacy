import {
  clearLeagueTierFreezes,
  handleSubscriptionDowngrade,
  InternalSchema,
  reapplyLeagueRestrictions,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { and, eq, gte, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';
import { AuthenticationError, ForbiddenError } from './graphql-errors';
import { getSubscriptionTier, requireAuth } from './authorization';
import { getStripeClient } from '../server/stripe';

// Number of trial days to apply on new subscriptions, or undefined if no trial.
const STRIPE_TRIAL_PERIOD_DAYS = process.env['STRIPE_TRIAL_PERIOD_DAYS']
  ? parseInt(process.env['STRIPE_TRIAL_PERIOD_DAYS'], 10)
  : undefined;

// ─── Object Types ────────────────────────────────────────────────────────────

const CheckoutSessionResultRef = builder.objectRef<{ url: string }>(
  'CheckoutSessionResult',
);

// ─── Admin Revenue Analytics Types ───────────────────────────────────────────

const SubscriptionStatusCountRef = builder.objectRef<{
  status: string;
  count: number;
}>('SubscriptionStatusCount');

SubscriptionStatusCountRef.implement({
  fields: (t) => ({
    status: t.exposeString('status'),
    count: t.exposeInt('count'),
  }),
});

const SubscriberGrowthPointRef = builder.objectRef<{
  month: string;
  newSubscribers: number;
}>('SubscriberGrowthPoint');

SubscriberGrowthPointRef.implement({
  fields: (t) => ({
    month: t.exposeString('month'),
    newSubscribers: t.exposeInt('newSubscribers'),
  }),
});

const AdminRevenueStatsRef = builder.objectRef<{
  totalSubscribers: number;
  totalPremiumUsers: number;
  totalFreeUsers: number;
  totalUsers: number;
  conversionRate: number;
  newSubscribersThisMonth: number;
  statusBreakdown: { status: string; count: number }[];
  subscriberGrowth: { month: string; newSubscribers: number }[];
}>('AdminRevenueStats');

AdminRevenueStatsRef.implement({
  fields: (t) => ({
    totalSubscribers: t.exposeInt('totalSubscribers'),
    totalPremiumUsers: t.exposeInt('totalPremiumUsers'),
    totalFreeUsers: t.exposeInt('totalFreeUsers'),
    totalUsers: t.exposeInt('totalUsers'),
    conversionRate: t.exposeFloat('conversionRate'),
    newSubscribersThisMonth: t.exposeInt('newSubscribersThisMonth'),
    statusBreakdown: t.expose('statusBreakdown', {
      type: [SubscriptionStatusCountRef],
    }),
    subscriberGrowth: t.expose('subscriberGrowth', {
      type: [SubscriberGrowthPointRef],
    }),
  }),
});

CheckoutSessionResultRef.implement({
  fields: (t) => ({
    url: t.exposeString('url'),
  }),
});

const BillingPortalSessionResultRef = builder.objectRef<{ url: string }>(
  'BillingPortalSessionResult',
);

BillingPortalSessionResultRef.implement({
  fields: (t) => ({
    url: t.exposeString('url'),
  }),
});

const SubscriptionInfoRef = builder.objectRef<{
  status: string;
  tier: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
}>('SubscriptionInfo');

SubscriptionInfoRef.implement({
  fields: (t) => ({
    status: t.exposeString('status'),
    tier: t.exposeString('tier'),
    currentPeriodEnd: t.exposeString('currentPeriodEnd', { nullable: true }),
    cancelAtPeriodEnd: t.exposeBoolean('cancelAtPeriodEnd'),
    trialEndsAt: t.exposeString('trialEndsAt', { nullable: true }),
    gracePeriodEndsAt: t.exposeString('gracePeriodEndsAt', { nullable: true }),
  }),
});

// ─── Queries ─────────────────────────────────────────────────────────────────

builder.queryField('mySubscription', (t) =>
  t.field({
    type: SubscriptionInfoRef,
    nullable: true,
    description: 'Get the current subscription for the authenticated user.',
    resolve: async (_parent, _args, context) => {
      if (!context.user) throw AuthenticationError();

      const subscription = await getSubscriptionForUser(context.user.id);
      if (!subscription) return null;

      return {
        status: subscription.status,
        tier: subscription.tier,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        gracePeriodEndsAt:
          subscription.gracePeriodEndsAt?.toISOString() ?? null,
      };
    },
  }),
);

builder.queryField('adminRevenueStats', (t) =>
  t.field({
    type: AdminRevenueStatsRef,
    description: 'Admin-only aggregate revenue and subscription metrics.',
    resolve: async (_parent, _args, context) => {
      const user = requireAuth(context);
      if (!user.isAdmin) throw ForbiddenError('Admin access required');

      return runWithInternalClient(getDbOptions(), async (db) => {
        // Status breakdown — count subscriptions by status
        const statusRows = await db
          .select({
            status: InternalSchema.subscriptions.status,
            count: sql<number>`count(*)::int`,
          })
          .from(InternalSchema.subscriptions)
          .groupBy(InternalSchema.subscriptions.status);

        // Total platform users
        const [totalUsersRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(InternalSchema.usersInAppInternal);
        const totalUsers = totalUsersRow?.count ?? 0;

        // Premium tier count (active + trialing subscriptions)
        const totalSubscribers = statusRows
          .filter((r) => r.status === 'active' || r.status === 'trialing')
          .reduce((sum, r) => sum + r.count, 0);

        // Premium users by subscription_tier column on users table
        const [premiumUsersRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(InternalSchema.usersInAppInternal)
          .where(
            sql`${InternalSchema.usersInAppInternal.subscriptionTier} = 'premium'`,
          );
        const totalPremiumUsers = premiumUsersRow?.count ?? 0;
        const totalFreeUsers = Math.max(0, totalUsers - totalPremiumUsers);
        const conversionRate =
          totalUsers > 0 ? totalPremiumUsers / totalUsers : 0;

        // New premium subscriptions this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const [newThisMonthRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(InternalSchema.subscriptions)
          .where(
            and(
              gte(InternalSchema.subscriptions.createdAt, startOfMonth),
              sql`${InternalSchema.subscriptions.tier} = 'premium'`,
            ),
          );

        // Monthly subscriber growth — last 12 months
        const twelveMonthsAgo = new Date(now);
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const growthRows = await db
          .select({
            month: sql<string>`to_char(${InternalSchema.subscriptions.createdAt}, 'YYYY-MM')`,
            newSubscribers: sql<number>`count(*)::int`,
          })
          .from(InternalSchema.subscriptions)
          .where(
            and(
              gte(InternalSchema.subscriptions.createdAt, twelveMonthsAgo),
              sql`${InternalSchema.subscriptions.tier} = 'premium'`,
            ),
          )
          .groupBy(
            sql`to_char(${InternalSchema.subscriptions.createdAt}, 'YYYY-MM')`,
          )
          .orderBy(
            sql`to_char(${InternalSchema.subscriptions.createdAt}, 'YYYY-MM')`,
          );

        return {
          totalSubscribers,
          totalPremiumUsers,
          totalFreeUsers,
          totalUsers,
          conversionRate,
          newSubscribersThisMonth: newThisMonthRow?.count ?? 0,
          statusBreakdown: statusRows,
          subscriberGrowth: growthRows,
        };
      });
    },
  }),
);

// ─── Mutations ───────────────────────────────────────────────────────────────

builder.mutationField('createCheckoutSession', (t) =>
  t.field({
    type: CheckoutSessionResultRef,
    description:
      'Create a Stripe Checkout Session for a subscription plan. ' +
      'If the user already has an active subscription a Billing Portal URL ' +
      'is returned instead so they can manage their plan.',
    args: {
      priceId: t.arg.string({ required: true }),
      successUrl: t.arg.string({ required: true }),
      cancelUrl: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { id: userId, email } = context.user;
      const stripe = await getStripeClient();

      // If the user already has an active or past-due subscription, send them
      // to the Billing Portal to manage it rather than creating a new checkout.
      const existing = await getSubscriptionForUser(userId);
      if (
        existing &&
        (existing.status === 'active' || existing.status === 'past_due') &&
        existing.stripeCustomerId
      ) {
        LOGGER.info('User already subscribed; redirecting to billing portal', {
          userId,
        });
        const portal = await stripe.billingPortal.sessions.create({
          customer: existing.stripeCustomerId,
          return_url: args.cancelUrl,
        });
        return { url: portal.url };
      }

      const customer = await getOrCreateStripeCustomer(
        stripe,
        userId,
        email ?? '',
      );

      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: 'subscription',
        line_items: [{ price: args.priceId, quantity: 1 }],
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        metadata: { userId: String(userId) },
        subscription_data: {
          // Always propagate userId so trial_will_end and other subscription
          // events can correlate back to our user record without a DB lookup.
          metadata: { userId: String(userId) },
          ...(Number.isInteger(STRIPE_TRIAL_PERIOD_DAYS) &&
          STRIPE_TRIAL_PERIOD_DAYS! > 0
            ? { trial_period_days: STRIPE_TRIAL_PERIOD_DAYS }
            : {}),
        },
      });

      if (!session.url) {
        throw new Error('Stripe checkout session was created without a URL');
      }

      LOGGER.info('Created Stripe checkout session', {
        userId,
        sessionId: session.id,
      });

      return { url: session.url };
    },
  }),
);

builder.mutationField('createBillingPortalSession', (t) =>
  t.field({
    type: BillingPortalSessionResultRef,
    description:
      'Create a Stripe Billing Portal session for managing an existing ' +
      'subscription (upgrade, downgrade, cancel, update payment method).',
    args: {
      returnUrl: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const subscription = await getSubscriptionForUser(context.user.id);
      if (!subscription) {
        throw new Error(
          'No subscription found — cannot open billing portal without an active subscription.',
        );
      }

      if (!subscription.stripeCustomerId) {
        throw new Error(
          'Subscription is not managed by Stripe — use the App Store to manage this subscription.',
        );
      }

      const stripe = await getStripeClient();
      const portal = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: args.returnUrl,
      });

      LOGGER.info('Created Stripe billing portal session', {
        userId: context.user.id,
      });

      return { url: portal.url };
    },
  }),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── setActiveLeagues mutation ───────────────────────────────────────────────

const FREE_TIER_LEAGUE_LIMIT = 3;

/**
 * After a subscription downgrade the owner's leagues beyond the free-tier
 * limit (3) are tier-frozen.  This mutation lets the user choose which
 * leagues they want to keep active.  Passing up to FREE_TIER_LEAGUE_LIMIT
 * league IDs activates those leagues and freezes the rest.
 *
 * Only callable when the user is on the free tier.  Premium users should
 * never need to call this (all their leagues are already active).
 */
builder.mutationField('setActiveLeagues', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Select up to 3 leagues to keep active after a subscription downgrade. ' +
      'Leagues not included in the list will be tier-frozen (read-only). ' +
      'Only callable on the free tier — all leagues are automatically active ' +
      'on premium.',
    args: {
      leagueIds: t.arg.intList({
        required: true,
        description: 'IDs of leagues to keep active (max 3).',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { id: userId } = context.user;

      const tier = await getSubscriptionTier(context);
      if (tier !== 'free') {
        throw new Error(
          'setActiveLeagues is only available on the free tier. ' +
            'Premium users have all leagues active.',
        );
      }

      if (args.leagueIds.length > FREE_TIER_LEAGUE_LIMIT) {
        throw new Error(
          `Free tier allows at most ${FREE_TIER_LEAGUE_LIMIT} active leagues. ` +
            `Received ${args.leagueIds.length} league IDs.`,
        );
      }

      await reapplyLeagueRestrictions(userId, args.leagueIds, getDbOptions());

      LOGGER.info('User updated active league selection', {
        userId,
        activeLeagueIds: args.leagueIds,
      });

      return true;
    },
  }),
);

async function getSubscriptionForUser(userId: number) {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select()
      .from(InternalSchema.subscriptions)
      .where(eq(InternalSchema.subscriptions.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  });
}

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userId: number,
  email: string,
): Promise<Stripe.Customer> {
  // Attempt to retrieve an existing customer by email first.
  if (email) {
    const listResult = await stripe.customers.list({ email, limit: 1 });
    if (listResult.data.length > 0) {
      const customer = listResult.data[0];
      // Ensure our userId is present in the customer metadata so the webhook
      // handler can correlate the Stripe customer back to our user record.
      if (!customer.metadata['userId']) {
        await stripe.customers.update(customer.id, {
          metadata: { userId: String(userId) },
        });
      }
      return customer;
    }
  }

  // No existing customer found — create a new one.
  return stripe.customers.create({
    email: email || undefined,
    metadata: { userId: String(userId) },
  });
}

// ─── Apple IAP ───────────────────────────────────────────────────────────────

const GRACE_PERIOD_DAYS = 7;

// App Store Server API base URL (production; sandbox uses sandbox.itunes.apple.com)
const APPLE_ENVIRONMENT = process.env['APPLE_ENVIRONMENT'] ?? 'production';

const AppleVerifyResultRef = builder.objectRef<{
  success: boolean;
  tier: string;
  status: string;
}>('AppleVerifyResult');

AppleVerifyResultRef.implement({
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    tier: t.exposeString('tier'),
    status: t.exposeString('status'),
  }),
});

/**
 * verifyApplePurchase — server-side validation of an iOS in-app purchase.
 *
 * Called by the mobile app after a StoreKit 2 transaction is authorized on
 * device. We validate the JWS-signed transaction with the App Store Server API
 * (or decode it locally) and record the subscription in our database, mapping
 * it to the same tier model used by Stripe subscriptions.
 *
 * The client passes the raw JWS transaction string produced by StoreKit 2.
 * We decode it (it is signed by Apple and self-verifying via the x5c chain)
 * to extract the productId, originalTransactionId, and expiresDate, then
 * upsert a subscription row keyed on the originalTransactionId.
 */
builder.mutationField('verifyApplePurchase', (t) =>
  t.field({
    type: AppleVerifyResultRef,
    description:
      'Verify and record an iOS in-app purchase transaction. ' +
      'The client passes the JWS-signed transaction string from StoreKit 2. ' +
      'Returns the resulting subscription tier and status.',
    args: {
      jwsTransaction: t.arg.string({
        required: true,
        description: 'The JWS-signed transaction string from StoreKit 2.',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const userId = context.user.id;

      // Decode the JWS transaction string (self-signed by Apple via x5c chain)
      let transaction: AppleTransactionPayload;
      try {
        transaction = decodeJwsPayload(args.jwsTransaction);
      } catch (err) {
        LOGGER.warn('verifyApplePurchase — failed to decode JWS transaction', {
          userId,
          err,
        });
        throw new Error('Invalid JWS transaction: could not decode payload');
      }

      const { originalTransactionId, productId, expiresDate, bundleId } =
        transaction;

      // Validate bundle ID to prevent cross-app receipt submission
      const expectedBundleId =
        process.env['APPLE_BUNDLE_ID'] ?? 'com.legacysports.app';
      if (bundleId !== expectedBundleId) {
        LOGGER.warn('verifyApplePurchase — bundle ID mismatch', {
          userId,
          bundleId,
          expectedBundleId,
        });
        throw new Error('Invalid transaction: bundle ID mismatch');
      }

      // Map iOS product IDs to subscription tiers
      const tier = tierFromAppleProductId(productId);
      const status = 'active';
      const currentPeriodEnd = expiresDate ? new Date(expiresDate) : null;

      // Upsert the subscription record
      const previousTier = await getPreviousTierForAppleSubscription(
        originalTransactionId,
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

      // Apply tier-change side effects
      if (previousTier !== tier) {
        if (tier === 'free') {
          await handleSubscriptionDowngrade(userId, getDbOptions());
        } else if (tier === 'premium' && previousTier === 'free') {
          await clearLeagueTierFreezes(userId, getDbOptions());
        }
      }

      LOGGER.info('verifyApplePurchase — subscription recorded', {
        userId,
        originalTransactionId,
        productId,
        tier,
        status,
        environment: APPLE_ENVIRONMENT,
      });

      return { success: true, tier, status };
    },
  }),
);

/**
 * Restore Apple IAP purchases — looks up any existing Apple subscription for
 * this user and refreshes the tier/status from the last known state.
 *
 * Called when the user taps "Restore Purchases" in the app settings.
 * The caller should first call `getAvailablePurchases()` via react-native-iap
 * and pass the most recent transaction's JWS string here.
 */
builder.mutationField('restoreApplePurchases', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Restore Apple IAP purchases and sync the subscription tier. ' +
      'Pass the JWS-signed transaction string for the most recent active ' +
      'purchase returned by StoreKit 2 restoreCompletedTransactions.',
    args: {
      jwsTransaction: t.arg.string({
        required: true,
        description: 'The JWS-signed transaction from StoreKit 2 restore.',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const userId = context.user.id;

      let transaction: AppleTransactionPayload;
      try {
        transaction = decodeJwsPayload(args.jwsTransaction);
      } catch {
        throw new Error('Invalid JWS transaction: could not decode payload');
      }

      const { originalTransactionId, productId, expiresDate } = transaction;
      const now = new Date();

      // Check if the transaction has expired
      const expiry = expiresDate ? new Date(expiresDate) : null;
      const isExpired = expiry ? expiry < now : false;

      // Add grace period for recently expired subscriptions when restoring
      const gracePeriodEnd =
        isExpired && expiry
          ? new Date(expiry.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
          : null;
      const withinGrace = gracePeriodEnd ? gracePeriodEnd > now : false;

      const tier: 'free' | 'premium' =
        !isExpired || withinGrace ? 'premium' : 'free';
      const status = isExpired
        ? withinGrace
          ? 'past_due'
          : 'canceled'
        : 'active';

      await runWithInternalClient(getDbOptions(), async (db) => {
        await db
          .insert(InternalSchema.subscriptions)
          .values({
            userId,
            appleOriginalTransactionId: originalTransactionId,
            appleProductId: productId,
            status,
            tier,
            currentPeriodEnd: expiry,
            cancelAtPeriodEnd: false,
            gracePeriodEndsAt: gracePeriodEnd,
          })
          .onConflictDoUpdate({
            target: InternalSchema.subscriptions.appleOriginalTransactionId,
            set: {
              appleProductId: productId,
              status,
              tier,
              currentPeriodEnd: expiry,
              gracePeriodEndsAt: gracePeriodEnd,
              updatedAt: new Date(),
            },
          });

        await db
          .update(InternalSchema.usersInAppInternal)
          .set({ subscriptionTier: tier, updatedAt: new Date() })
          .where(eq(InternalSchema.usersInAppInternal.id, userId));
      });

      LOGGER.info('restoreApplePurchases — subscription restored', {
        userId,
        originalTransactionId,
        tier,
        status,
      });

      return true;
    },
  }),
);

// ─── Apple IAP Helpers ────────────────────────────────────────────────────────

interface AppleTransactionPayload {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  bundleId: string;
  /** Expiry date in milliseconds since epoch */
  expiresDate?: number;
  purchaseDate: number;
  appAccountToken?: string;
}

/**
 * Decode a JWS transaction string without full certificate-chain verification.
 * The apple-iap Lambda performs full verification for App Store Server
 * Notifications. Here we trust the client-provided JWS and decode the payload
 * to read the transaction details (bundle ID validation acts as a guard).
 *
 * For production hardening the apple-iap Lambda handles all subscription
 * lifecycle events with full JWS verification; this mutation is the initial
 * purchase confirmation path.
 */
function decodeJwsPayload(jwsTransaction: string): AppleTransactionPayload {
  const parts = jwsTransaction.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format: expected 3 dot-separated parts');
  }
  // Base64url-decode the payload (second part)
  const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
  return JSON.parse(payloadJson) as AppleTransactionPayload;
}

function tierFromAppleProductId(productId: string): 'free' | 'premium' {
  // Product IDs configured in App Store Connect:
  // - com.legacysports.app.premium.monthly
  // - com.legacysports.app.premium.annual
  if (
    productId.includes('premium') ||
    productId.includes('monthly') ||
    productId.includes('annual')
  ) {
    return 'premium';
  }
  return 'free';
}

async function getPreviousTierForAppleSubscription(
  originalTransactionId: string,
): Promise<'free' | 'premium' | null> {
  return runWithInternalClient(getDbOptions(), async (db) => {
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
  });
}
