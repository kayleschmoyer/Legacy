import {
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
        (existing.status === 'active' || existing.status === 'past_due')
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
