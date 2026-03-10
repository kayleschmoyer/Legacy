import {
  InternalSchema,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';
import { getStripeClient } from '../server/stripe';

// ─── Object Types ────────────────────────────────────────────────────────────

const CheckoutSessionResultRef = builder.objectRef<{ url: string }>(
  'CheckoutSessionResult',
);

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
}>('SubscriptionInfo');

SubscriptionInfoRef.implement({
  fields: (t) => ({
    status: t.exposeString('status'),
    tier: t.exposeString('tier'),
    currentPeriodEnd: t.exposeString('currentPeriodEnd', { nullable: true }),
    cancelAtPeriodEnd: t.exposeBoolean('cancelAtPeriodEnd'),
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
      };
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
