import Stripe from 'stripe';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import '../env';

const STRIPE_SECRET_KEY_LOCAL = process.env['STRIPE_SECRET_KEY'] ?? '';
const STRIPE_SECRET_KEY_SECRET_NAME =
  process.env['STRIPE_SECRET_KEY_SECRET_NAME'] ?? '';

let stripeClientPromise: Promise<Stripe> | null = null;

/** Returns a lazily-initialized, cached Stripe client. */
export function getStripeClient(): Promise<Stripe> {
  if (!stripeClientPromise) {
    stripeClientPromise = initStripeClient();
  }
  return stripeClientPromise;
}

async function initStripeClient(): Promise<Stripe> {
  let secretKey: string;

  if (STRIPE_SECRET_KEY_LOCAL) {
    secretKey = STRIPE_SECRET_KEY_LOCAL;
  } else if (STRIPE_SECRET_KEY_SECRET_NAME) {
    secretKey = await retrieveSecretParameterValue(
      STRIPE_SECRET_KEY_SECRET_NAME,
    );
  } else {
    throw new Error(
      'Stripe secret key not configured: set STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_SECRET_NAME',
    );
  }

  return new Stripe(secretKey);
}
