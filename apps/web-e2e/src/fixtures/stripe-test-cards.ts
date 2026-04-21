/**
 * Stripe test card numbers for use in E2E tests (test mode only).
 * https://stripe.com/docs/testing#cards
 */
export const STRIPE_TEST_CARDS = {
  /** Succeeds and immediately processes the payment. */
  VISA_SUCCESS: '4242424242424242',

  /** Always declines with a generic decline code. */
  VISA_DECLINE: '4000000000000002',

  /** Requires 3D Secure authentication before succeeding. */
  VISA_3D_SECURE: '4000002500003155',

  /** Declines with an insufficient_funds code. */
  VISA_INSUFFICIENT_FUNDS: '4000000000009995',
} as const;

/** Expiry date that passes Stripe's validation in test mode. */
export const STRIPE_TEST_EXPIRY = { month: '12', year: '34' } as const;

/** 3-digit CVV accepted for the Visa test cards defined in this file. */
export const STRIPE_TEST_CVV = '123';
