import Stripe from 'stripe';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';

// ── Secrets ──────────────────────────────────────────────────────────────────
// Mirrors lambdas/stripe-webhook/src/index.ts: prefer a local env value (dev /
// local runs), otherwise resolve the secret from Secrets Manager by name.

const STRIPE_SECRET_KEY_LOCAL = process.env['STRIPE_SECRET_KEY'] ?? '';
const STRIPE_SECRET_KEY_SECRET_NAME =
  process.env['STRIPE_SECRET_KEY_SECRET_NAME'] ?? '';

// Pinned Stripe API version — kept in lockstep with the stripe-webhook lambda.
// Without this, the SDK defaults to whatever version ships with the installed
// build, so an SDK bump (e.g. dependabot) can silently change response shapes.
// To upgrade: read Stripe's API changelog, adjust any affected accesses, then
// bump this constant in both this file and lambdas/stripe-webhook.
const STRIPE_API_VERSION = '2026-02-25.clover' as const;

let stripeClientPromise: Promise<Stripe> | null = null;

/**
 * Lazily construct (and memoize across warm Lambda invocations) a Stripe client
 * for the oauth-proxy lambda. The API key comes from a local env var when set,
 * otherwise from Secrets Manager via aws-utils.
 */
export function getStripeClient(): Promise<Stripe> {
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
