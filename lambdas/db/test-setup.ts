import { config } from 'dotenv';
import { TextDecoder, TextEncoder } from 'util';

config();

// createCheckoutSession fails closed when the Stripe price allowlist (read from
// env at schema module load) is empty (LS-7421), so give every spec a
// configured allowlist like a deployed environment has. Specs covering the
// unconfigured case unset it and re-import the schema.
process.env['STRIPE_MONTHLY_PRICE_ID'] = 'price_test';

Object.assign(global, { TextDecoder, TextEncoder });
