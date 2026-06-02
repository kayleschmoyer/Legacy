import {
  clearLeagueTierFreezes,
  handleSubscriptionDowngrade,
  InternalSchema,
  reapplyLeagueRestrictions,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { captureWarning } from '@legacy-sports/rollbar';
import type { WebSocketNotificationService } from '@legacy-sports/aws-utils';
import { builder } from './builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from './graphql-errors';
import {
  getSubscriptionTier,
  requireAuth,
  requireNotImpersonating,
} from './authorization';
import { getStripeClient } from '../server/stripe';
import {
  fetchGoogleSubscription,
  GOOGLE_PLAY_PACKAGE_NAME,
  isActiveGoogleSubscription,
  type SubscriptionPurchaseV2,
} from '../server/google-play';
import {
  decodeAndVerifyJwsTransaction,
  type VerifiedAppleTransactionPayload,
} from '../apple-jws';

// Number of trial days to apply on new subscriptions, or undefined if no trial.
const STRIPE_TRIAL_PERIOD_DAYS = process.env['STRIPE_TRIAL_PERIOD_DAYS']
  ? parseInt(process.env['STRIPE_TRIAL_PERIOD_DAYS'], 10)
  : undefined;

/**
 * Build the trial-dependent fragments of a Stripe Checkout Session.
 *
 * When a trial is configured we apply `trial_period_days` AND defer card
 * collection via `payment_method_collection: 'if_required'`. Stripe defaults
 * subscription-mode checkout to collecting a card up front, which would
 * contradict the "no credit card required" trial copy on the pricing page
 * (LS-5200). When no trial is configured, both fragments are empty so checkout
 * behaves exactly as before.
 *
 * Exported for unit testing.
 */
export function buildCheckoutTrialParams(trialPeriodDays: number | undefined): {
  session: { payment_method_collection?: 'if_required' };
  subscription: { trial_period_days?: number };
} {
  if (typeof trialPeriodDays === 'number' && trialPeriodDays > 0) {
    return {
      session: { payment_method_collection: 'if_required' },
      subscription: { trial_period_days: trialPeriodDays },
    };
  }
  return { session: {}, subscription: {} };
}

// Allowlist of valid Stripe Price IDs for subscription plans.
// When populated, only these IDs are accepted in createCheckoutSession.
const STRIPE_ALLOWED_PRICE_IDS: ReadonlySet<string> = new Set(
  [
    process.env['STRIPE_MONTHLY_PRICE_ID'],
    process.env['STRIPE_ANNUAL_PRICE_ID'],
  ].filter((id): id is string => Boolean(id)),
);

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

// ─── Stripe Prices ──────────────────────────────────────────────────────────

const StripePriceInfoRef = builder.objectRef<{
  monthlyPriceCents: number;
  annualTotalCents: number;
  monthlyPriceId: string;
  annualPriceId: string;
  trialPeriodDays: number;
}>('StripePriceInfo');

StripePriceInfoRef.implement({
  fields: (t) => ({
    monthlyPriceCents: t.exposeInt('monthlyPriceCents', { nullable: false }),
    annualTotalCents: t.exposeInt('annualTotalCents', { nullable: false }),
    monthlyPriceId: t.exposeString('monthlyPriceId', { nullable: false }),
    annualPriceId: t.exposeString('annualPriceId', { nullable: false }),
    // Number of free trial days offered on new subscriptions (0 = no trial).
    // Lets the client keep its trial messaging in sync with the actual Stripe
    // checkout config instead of hardcoding a trial that may not exist (LS-5200).
    trialPeriodDays: t.exposeInt('trialPeriodDays', { nullable: false }),
  }),
});

// ─── Donation Payment Link ───────────────────────────────────────────────────

const DonationPaymentLinkResultRef = builder.objectRef<{ url: string }>(
  'DonationPaymentLinkResult',
);

DonationPaymentLinkResultRef.implement({
  fields: (t) => ({
    url: t.exposeString('url', { nullable: false }),
  }),
});

builder.queryField('donationPaymentLink', (t) =>
  t.field({
    type: DonationPaymentLinkResultRef,
    nullable: true,
    description:
      'Return the Stripe Payment Link URL for one-time donations. ' +
      'No authentication required. Returns null when not configured.',
    resolve: () => {
      const url = process.env['STRIPE_DONATION_PAYMENT_LINK'];
      if (!url) return null;
      // Require https and a known Stripe Payment Link host to prevent
      // accidental open-redirect if the env var is misconfigured.
      const isStripeHost =
        url.startsWith('https://buy.stripe.com/') ||
        url.startsWith('https://checkout.stripe.com/');
      if (!isStripeHost) {
        LOGGER.warn(
          'STRIPE_DONATION_PAYMENT_LINK is set but does not start with a recognised Stripe Payment Link host — returning null',
          { url },
        );
        return null;
      }
      return { url };
    },
  }),
);

type StripePriceResult = {
  monthlyPriceCents: number;
  annualTotalCents: number;
  monthlyPriceId: string;
  annualPriceId: string;
};

/**
 * In-memory TTL cache for Stripe prices. Stores the in-flight Promise rather
 * than the resolved value so concurrent callers on cold start or TTL expiry
 * all await the same fetch instead of each triggering a separate Stripe call.
 */
let cachedPrices: Promise<StripePriceResult> | null = null;
let cachedPricesExpiresAt = 0;
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchStripePrices(): Promise<StripePriceResult> {
  const now = Date.now();
  if (cachedPrices && now < cachedPricesExpiresAt) {
    return cachedPrices;
  }

  // Assign the promise synchronously before any await so every concurrent
  // caller that passes the TTL check above shares this single in-flight fetch.
  cachedPricesExpiresAt = now + PRICE_CACHE_TTL_MS;
  const promise = doFetchStripePrices();
  cachedPrices = promise;
  promise.catch(() => {
    cachedPrices = null;
    cachedPricesExpiresAt = 0;
  });
  return promise;
}

/** Reset the price cache. Exposed for unit tests only. */
export function _resetStripePricesCache(): void {
  cachedPrices = null;
  cachedPricesExpiresAt = 0;
}

async function doFetchStripePrices(): Promise<StripePriceResult> {
  const monthlyPriceId = process.env['STRIPE_MONTHLY_PRICE_ID'];
  const annualPriceId = process.env['STRIPE_ANNUAL_PRICE_ID'];

  if (!monthlyPriceId || !annualPriceId) {
    throw new Error(
      'Stripe price IDs are not configured (STRIPE_MONTHLY_PRICE_ID / STRIPE_ANNUAL_PRICE_ID)',
    );
  }

  const stripe = await getStripeClient();
  const [monthlyPrice, annualPrice] = await Promise.all([
    stripe.prices.retrieve(monthlyPriceId),
    stripe.prices.retrieve(annualPriceId),
  ]);

  if (
    typeof monthlyPrice.unit_amount !== 'number' ||
    typeof annualPrice.unit_amount !== 'number'
  ) {
    throw new Error(
      'Stripe prices do not have unit_amount set — metered or tiered pricing is not supported',
    );
  }

  return {
    monthlyPriceCents: monthlyPrice.unit_amount,
    annualTotalCents: annualPrice.unit_amount,
    monthlyPriceId,
    annualPriceId,
  };
}

builder.queryField('stripePrices', (t) =>
  t.field({
    type: StripePriceInfoRef,
    nullable: true,
    description:
      'Return live subscription prices from Stripe. ' +
      'No authentication required — pricing is public. ' +
      'Results are cached server-side for 5 minutes.',
    resolve: async () => {
      try {
        const prices = await fetchStripePrices();
        return { ...prices, trialPeriodDays: STRIPE_TRIAL_PERIOD_DAYS ?? 0 };
      } catch (err) {
        LOGGER.warn('Failed to fetch Stripe prices; returning null', {
          error: err,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
  }),
);

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

/**
 * Subscription statuses that mean the user already has a Stripe-managed
 * subscription and should be sent to the Billing Portal instead of being allowed
 * to start a new Checkout Session. `trialing` is included so a trial user is not
 * allowed to create a duplicate subscription alongside their active trial
 * (LS-5196).
 */
const BILLING_PORTAL_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'past_due',
  'trialing',
]);

/**
 * Returns true when an existing subscription should redirect the user to the
 * Stripe Billing Portal rather than create a new Checkout Session. Requires both
 * a billing-portal-eligible status and a Stripe customer ID to manage.
 */
export function shouldRedirectToBillingPortal<
  T extends { status: string; stripeCustomerId: string | null },
>(
  existing: T | null | undefined,
): existing is T & { stripeCustomerId: string } {
  return (
    !!existing &&
    BILLING_PORTAL_SUBSCRIPTION_STATUSES.has(existing.status) &&
    !!existing.stripeCustomerId
  );
}

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
      requireNotImpersonating(context);

      if (!args.priceId || !args.priceId.startsWith('price_')) {
        throw UserInputError(
          'Invalid or missing Stripe price ID. Please contact support if this issue persists.',
        );
      }

      if (
        STRIPE_ALLOWED_PRICE_IDS.size > 0 &&
        !STRIPE_ALLOWED_PRICE_IDS.has(args.priceId)
      ) {
        throw UserInputError(
          'The provided price ID is not a recognized subscription plan. Please contact support if this issue persists.',
        );
      }

      const { id: userId, email } = context.user;
      const stripe = await getStripeClient();

      // If the user already has an active, past-due, or trialing subscription,
      // send them to the Billing Portal to manage it rather than creating a new
      // checkout (which would duplicate the subscription for a trialing user).
      const existing = await getSubscriptionForUser(userId);
      if (shouldRedirectToBillingPortal(existing)) {
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
        existing?.stripeCustomerId,
      );

      const trialParams = buildCheckoutTrialParams(STRIPE_TRIAL_PERIOD_DAYS);

      let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
      try {
        session = await stripe.checkout.sessions.create({
          customer: customer.id,
          mode: 'subscription',
          line_items: [{ price: args.priceId, quantity: 1 }],
          success_url: args.successUrl,
          cancel_url: args.cancelUrl,
          metadata: { userId: String(userId) },
          // When a trial is configured, defer card collection so the trial is
          // genuinely "no credit card required" (matches the pricing copy).
          // Stripe defaults to 'always' for subscription mode, which would ask
          // for a card up front despite the trial (LS-5200).
          ...trialParams.session,
          subscription_data: {
            // Always propagate userId so trial_will_end and other subscription
            // events can correlate back to our user record without a DB lookup.
            metadata: { userId: String(userId) },
            ...trialParams.subscription,
          },
        });
      } catch (err) {
        if (err instanceof Stripe.errors.StripeInvalidRequestError) {
          LOGGER.warn('Stripe rejected checkout session creation', {
            userId,
            priceId: args.priceId,
            message: err.message,
          });
          throw UserInputError(
            'The selected plan could not be processed. Please contact support if this issue persists.',
          );
        }
        throw err;
      }

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
      requireNotImpersonating(context);

      const subscription = await getSubscriptionForUser(context.user.id);
      if (!subscription) {
        throw UserInputError(
          'No subscription found — cannot open billing portal without an active subscription.',
        );
      }

      if (!subscription.stripeCustomerId) {
        throw UserInputError(
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
      requireNotImpersonating(context);

      const { id: userId } = context.user;

      const tier = await getSubscriptionTier(context);
      if (tier !== 'free') {
        throw UserInputError(
          'setActiveLeagues is only available on the free tier. ' +
            'Premium users have all leagues active.',
        );
      }

      if (args.leagueIds.length > FREE_TIER_LEAGUE_LIMIT) {
        throw UserInputError(
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

// Project only the columns the callers actually use. A bare `db.select()`
// asks Drizzle to enumerate every column defined in the schema, which makes
// the resolver fail with INTERNAL_SERVER_ERROR whenever the deployed DB is
// behind the bundled schema by even a single column (LS-4297). Explicit
// projection keeps the query forward-compatible with future column additions.
//
// Order by created_at DESC (with id DESC as a deterministic tiebreaker for rows
// sharing a timestamp) so we always return the most recent subscription row. A
// user who resubscribes after cancellation has both the old canceled row and a
// new active row; without ordering, `.limit(1)` could return the stale canceled
// row and leave a paying user appearing as free (LS-5201).
export async function getSubscriptionForUser(userId: number) {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select({
        id: InternalSchema.subscriptions.id,
        status: InternalSchema.subscriptions.status,
        tier: InternalSchema.subscriptions.tier,
        currentPeriodEnd: InternalSchema.subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: InternalSchema.subscriptions.cancelAtPeriodEnd,
        trialEndsAt: InternalSchema.subscriptions.trialEndsAt,
        gracePeriodEndsAt: InternalSchema.subscriptions.gracePeriodEndsAt,
        stripeCustomerId: InternalSchema.subscriptions.stripeCustomerId,
        stripeSubscriptionId: InternalSchema.subscriptions.stripeSubscriptionId,
      })
      .from(InternalSchema.subscriptions)
      .where(eq(InternalSchema.subscriptions.userId, userId))
      .orderBy(
        desc(InternalSchema.subscriptions.createdAt),
        desc(InternalSchema.subscriptions.id),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userId: number,
  email: string,
  existingCustomerId?: string | null,
): Promise<Stripe.Customer> {
  // If we have a stored customer ID, retrieve directly — never search by email
  // (email search can match a customer belonging to a different user account).
  if (existingCustomerId) {
    const customer = await stripe.customers.retrieve(existingCustomerId);
    if (!customer.deleted) {
      return customer;
    }
  }

  // No valid stored customer — create a new one.
  return stripe.customers.create({
    email: email || undefined,
    metadata: { userId: String(userId) },
  });
}

// ─── Grace period expiry (scheduled) ─────────────────────────────────────────

interface ExpireSubscriptionGracePeriodsResultShape {
  expired: number;
  errors: string[];
}

const ExpireSubscriptionGracePeriodsResultRef =
  builder.objectRef<ExpireSubscriptionGracePeriodsResultShape>(
    'ExpireSubscriptionGracePeriodsResult',
  );

ExpireSubscriptionGracePeriodsResultRef.implement({
  fields: (t) => ({
    expired: t.exposeInt('expired'),
    errors: t.exposeStringList('errors'),
  }),
});

/**
 * Scheduled sweep: downgrade premium users whose payment-failure grace period
 * has expired.
 *
 * The Stripe webhook's `invoice.payment_failed` handler sets
 * `grace_period_ends_at = now + GRACE_PERIOD_DAYS` and only downgrades when a
 * subsequent `invoice.payment_failed` arrives past that deadline.  If Stripe
 * stops retrying (after exhausting retries) or never delivers another event
 * after the grace period, the user would keep premium indefinitely despite
 * never paying.  This sweep closes that gap by processing expired grace
 * periods on a fixed schedule (hourly via EventBridge).
 *
 * Idempotent: rows are filtered on `tier = 'premium'`, so once a row is
 * downgraded it won't be re-processed.
 *
 * Exported (not just wired into the resolver) so it can be unit-tested
 * independently of the Pothos builder.
 */
export async function expireSubscriptionGracePeriods(
  notificationService: WebSocketNotificationService | null | undefined,
): Promise<ExpireSubscriptionGracePeriodsResultShape> {
  LOGGER.info('[expireSubscriptionGracePeriods] Starting sweep');

  const result: ExpireSubscriptionGracePeriodsResultShape = {
    expired: 0,
    errors: [],
  };

  const now = new Date();

  const rows = await runWithInternalClient(getDbOptions(), async (db) =>
    db
      .select({
        id: InternalSchema.subscriptions.id,
        userId: InternalSchema.subscriptions.userId,
        stripeSubscriptionId: InternalSchema.subscriptions.stripeSubscriptionId,
        gracePeriodEndsAt: InternalSchema.subscriptions.gracePeriodEndsAt,
      })
      .from(InternalSchema.subscriptions)
      .where(
        and(
          eq(InternalSchema.subscriptions.status, 'past_due'),
          eq(InternalSchema.subscriptions.tier, 'premium'),
          lt(InternalSchema.subscriptions.gracePeriodEndsAt, now),
        ),
      ),
  );

  LOGGER.info(
    `[expireSubscriptionGracePeriods] Found ${rows.length} expired grace periods`,
  );

  for (const row of rows) {
    try {
      await runWithInternalClient(getDbOptions(), async (db) => {
        // Scope the update to the specific row by primary key — a user may
        // theoretically hold multiple platform rows (Stripe + Apple IAP), and
        // the sweep must only touch the expired one.
        await db
          .update(InternalSchema.subscriptions)
          .set({ tier: 'free', updatedAt: new Date() })
          .where(eq(InternalSchema.subscriptions.id, row.id));
        await db
          .update(InternalSchema.usersInAppInternal)
          .set({ subscriptionTier: 'free', updatedAt: new Date() })
          .where(eq(InternalSchema.usersInAppInternal.id, row.userId));
      });

      await handleSubscriptionDowngrade(row.userId, getDbOptions());

      if (notificationService) {
        try {
          await notificationService.notifySubscriptionUpdated(
            row.userId,
            'free',
            'past_due',
          );
        } catch (err) {
          LOGGER.warn(
            '[expireSubscriptionGracePeriods] Notification failed (non-fatal)',
            { err, userId: row.userId },
          );
        }
      }

      result.expired++;
      LOGGER.info('[expireSubscriptionGracePeriods] Downgraded user to free', {
        userId: row.userId,
        stripeSubscriptionId: row.stripeSubscriptionId,
        gracePeriodEndsAt: row.gracePeriodEndsAt,
      });
    } catch (err) {
      const errMsg = `User ${row.userId}: ${err instanceof Error ? err.message : String(err)}`;
      LOGGER.error(
        `[expireSubscriptionGracePeriods] Error downgrading user: ${errMsg}`,
      );
      result.errors.push(errMsg);
    }
  }

  LOGGER.info('[expireSubscriptionGracePeriods] Completed', {
    expired: result.expired,
    errorCount: result.errors.length,
  });

  return result;
}

builder.mutationField('expireSubscriptionGracePeriods', (t) =>
  t.field({
    type: ExpireSubscriptionGracePeriodsResultRef,
    description:
      'Downgrade premium subscriptions whose grace_period_ends_at has passed. ' +
      'System / admin only. Triggered hourly by EventBridge.',
    resolve: async (_parent, _args, context) => {
      if (!context.isSystemRequest && !context.user?.isAdmin) {
        throw ForbiddenError(
          'Only system processes or admins can expire subscription grace periods.',
        );
      }
      return expireSubscriptionGracePeriods(context.notificationService);
    },
  }),
);

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
      requireNotImpersonating(context);

      const userId = context.user.id;

      // Decode and cryptographically verify the JWS transaction (x5c chain + ES256 signature)
      let transaction: AppleTransactionPayload;
      try {
        transaction = await decodeAndVerifyJwsTransaction(args.jwsTransaction);
      } catch (err) {
        LOGGER.warn('verifyApplePurchase — failed to verify JWS transaction', {
          userId,
          err,
        });
        captureWarning(
          new Error('verifyApplePurchase — failed to verify JWS transaction'),
          {
            userId,
            cause: err instanceof Error ? err.message : String(err),
            operation: 'verifyApplePurchase',
          },
        );
        throw UserInputError(
          'Invalid JWS transaction: could not verify payload',
        );
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
        captureWarning(new Error('verifyApplePurchase — bundle ID mismatch'), {
          userId,
          bundleId,
          expectedBundleId,
          operation: 'verifyApplePurchase',
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
      requireNotImpersonating(context);

      const userId = context.user.id;

      let transaction: AppleTransactionPayload;
      try {
        transaction = await decodeAndVerifyJwsTransaction(args.jwsTransaction);
      } catch (err) {
        LOGGER.warn(
          'restoreApplePurchases — failed to verify JWS transaction',
          {
            userId,
            err,
          },
        );
        throw UserInputError(
          'Invalid JWS transaction: could not verify payload',
        );
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

type AppleTransactionPayload = VerifiedAppleTransactionPayload;

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

// ─── Google Play Billing ──────────────────────────────────────────────────────

// Google Play product IDs as configured in Google Play Console
const GOOGLE_PLAY_PRODUCT_IDS = [
  'com.legacysports.app.premium.monthly',
  'com.legacysports.app.premium.annual',
] as const;

const GoogleVerifyResultRef = builder.objectRef<{
  success: boolean;
  tier: string;
  status: string;
}>('GoogleVerifyResult');

GoogleVerifyResultRef.implement({
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    tier: t.exposeString('tier'),
    status: t.exposeString('status'),
  }),
});

/**
 * verifyGooglePurchase — server-side validation of an Android Google Play
 * in-app purchase.
 *
 * Called by the mobile app after a successful `requestSubscription` via
 * react-native-iap on Android. The client passes the `purchaseToken` returned
 * by the Google Play Billing Library and the `productId` purchased.
 *
 * We verify the purchase token via the Google Play Developer API
 * (purchases.subscriptionsv2.get) and record the subscription in our database,
 * mapping it to the same tier model used by Stripe subscriptions.
 */
builder.mutationField('verifyGooglePurchase', (t) =>
  t.field({
    type: GoogleVerifyResultRef,
    description:
      'Verify and record an Android Google Play Billing purchase. ' +
      'The client passes the purchaseToken and productId from the Billing Library. ' +
      'Returns the resulting subscription tier and status.',
    args: {
      purchaseToken: t.arg.string({
        required: true,
        description:
          'The purchase token returned by the Google Play Billing Library.',
      }),
      productId: t.arg.string({
        required: true,
        description: 'The Google Play product ID that was purchased.',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      requireNotImpersonating(context);

      const userId = context.user.id;
      const { purchaseToken, productId } = args;

      // Validate the product ID is a known Google Play subscription
      const knownProductId = GOOGLE_PLAY_PRODUCT_IDS.find(
        (id) => id === productId,
      );
      if (!knownProductId) {
        LOGGER.warn('verifyGooglePurchase — unknown productId', {
          userId,
          productId,
        });
        captureWarning(new Error('verifyGooglePurchase — unknown productId'), {
          userId,
          productId,
          operation: 'verifyGooglePurchase',
        });
        throw new Error(`Unknown Google Play product ID: ${productId}`);
      }

      // Verify the purchase token against the Google Play Developer API
      const googleSub = await fetchGoogleSubscription(
        GOOGLE_PLAY_PACKAGE_NAME,
        purchaseToken,
      );
      if (!isActiveGoogleSubscription(googleSub)) {
        LOGGER.warn('verifyGooglePurchase — subscription not active', {
          userId,
          productId,
          subscriptionState: googleSub.subscriptionState,
        });
        captureWarning(
          new Error('verifyGooglePurchase — subscription not active'),
          {
            userId,
            productId,
            subscriptionState: googleSub.subscriptionState,
            operation: 'verifyGooglePurchase',
          },
        );
        throw UserInputError(
          `Google Play subscription is not active: ${googleSub.subscriptionState}`,
        );
      }

      const tier = tierFromGoogleProductId(productId);
      const status = 'active';

      // Record the renewal date so Android subscribers see their next billing
      // period and expiry is tracked (mirrors the Apple path).
      const expiryTime = googleSub.lineItems?.[0]?.expiryTime;
      const currentPeriodEnd = expiryTime ? new Date(expiryTime) : null;

      // Determine previous tier to apply side effects on tier change
      const previousTier =
        await getPreviousTierForGooglePurchase(purchaseToken);

      await runWithInternalClient(getDbOptions(), async (db) => {
        await db
          .insert(InternalSchema.subscriptions)
          .values({
            userId,
            googlePurchaseToken: purchaseToken,
            googleProductId: productId,
            status,
            tier,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
          })
          .onConflictDoUpdate({
            target: InternalSchema.subscriptions.googlePurchaseToken,
            set: {
              googleProductId: productId,
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

      LOGGER.info('verifyGooglePurchase — subscription recorded', {
        userId,
        productId,
        tier,
        status,
      });

      return { success: true, tier, status };
    },
  }),
);

/**
 * restoreGooglePurchases — validate a Google Play purchase token against the
 * Play Developer API, then sync the resulting tier/status for this user.
 *
 * Called when the user taps "Restore Purchases" on Android. The caller passes
 * the most recent purchaseToken from react-native-iap's getAvailablePurchases().
 *
 * Previously this mutation unconditionally set status:active, allowing any
 * user with a stale token (cancelled, refunded, expired) to restore premium
 * indefinitely. Now we validate the token against purchases.subscriptionsv2.get
 * before writing, matching the expiry-aware logic in restoreApplePurchases.
 */
builder.mutationField('restoreGooglePurchases', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Restore Google Play subscriptions and sync the subscription tier. ' +
      'Pass the purchaseToken for the most recent active purchase returned ' +
      'by react-native-iap getAvailablePurchases on Android.',
    args: {
      purchaseToken: t.arg.string({
        required: true,
        description: 'The purchase token from Google Play Billing Library.',
      }),
      productId: t.arg.string({
        required: true,
        description: 'The Google Play product ID associated with the token.',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      requireNotImpersonating(context);

      const userId = context.user.id;
      const { purchaseToken, productId } = args;

      // Validate the purchase token against the Google Play Developer API.
      let googleSub;
      try {
        googleSub = await fetchGoogleSubscription(
          GOOGLE_PLAY_PACKAGE_NAME,
          purchaseToken,
        );
      } catch (err) {
        LOGGER.error('restoreGooglePurchases — Google Play API call failed', {
          userId,
          productId,
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }

      if (!isActiveGoogleSubscription(googleSub)) {
        LOGGER.warn('restoreGooglePurchases — subscription not active', {
          userId,
          productId,
          subscriptionState: googleSub.subscriptionState,
        });
        return false;
      }

      const { tier, status, currentPeriodEnd } =
        tierAndStatusFromGoogleSubscription(googleSub, productId);

      const previousTier =
        await getPreviousTierForGooglePurchase(purchaseToken);

      // `currentPeriodEnd` (the renewal date, so Android subscribers see their
      // next billing period) is derived above by tierAndStatusFromGoogleSubscription,
      // which matches the lineItem by productId — mirrors the Apple path.
      await runWithInternalClient(getDbOptions(), async (db) => {
        await db
          .insert(InternalSchema.subscriptions)
          .values({
            userId,
            googlePurchaseToken: purchaseToken,
            googleProductId: productId,
            status,
            tier,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
          })
          .onConflictDoUpdate({
            target: InternalSchema.subscriptions.googlePurchaseToken,
            set: {
              googleProductId: productId,
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

      LOGGER.info('restoreGooglePurchases — subscription restored', {
        userId,
        productId,
        tier,
        status,
        subscriptionState: googleSub.subscriptionState,
      });

      return true;
    },
  }),
);

// ─── Google Play Helpers ──────────────────────────────────────────────────────

function tierFromGoogleProductId(productId: string): 'free' | 'premium' {
  // Product IDs configured in Google Play Console:
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

/**
 * Derive tier, status, and currentPeriodEnd from a Google Play
 * SubscriptionPurchaseV2 resource.
 *
 * State mapping:
 *   ACTIVE            → active / premium
 *   IN_GRACE_PERIOD   → past_due / premium  (payment failing but within grace window)
 *   CANCELED/EXPIRED  → canceled / free
 *   other             → canceled / free
 */
export function tierAndStatusFromGoogleSubscription(
  subscription: SubscriptionPurchaseV2,
  productId: string,
): {
  tier: 'free' | 'premium';
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date | null;
} {
  const state = subscription.subscriptionState;

  const expiryItem = subscription.lineItems?.find(
    (item) => item.productId === productId,
  );
  const currentPeriodEnd = expiryItem?.expiryTime
    ? new Date(expiryItem.expiryTime)
    : null;

  if (state === 'SUBSCRIPTION_STATE_ACTIVE') {
    return { tier: 'premium', status: 'active', currentPeriodEnd };
  }
  if (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
    return { tier: 'premium', status: 'past_due', currentPeriodEnd };
  }
  const knownInactiveStates = new Set([
    'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_UNSPECIFIED',
  ]);
  if (!knownInactiveStates.has(state)) {
    LOGGER.warn(
      'tierAndStatusFromGoogleSubscription — unknown subscriptionState, treating as canceled',
      { subscriptionState: state },
    );
  }
  return { tier: 'free', status: 'canceled', currentPeriodEnd };
}

async function getPreviousTierForGooglePurchase(
  purchaseToken: string,
): Promise<'free' | 'premium' | null> {
  return runWithInternalClient(getDbOptions(), async (db) => {
    const rows = await db
      .select({ tier: InternalSchema.subscriptions.tier })
      .from(InternalSchema.subscriptions)
      .where(
        eq(InternalSchema.subscriptions.googlePurchaseToken, purchaseToken),
      )
      .limit(1);
    return (rows[0]?.tier ?? null) as 'free' | 'premium' | null;
  });
}
