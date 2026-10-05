import { config } from 'dotenv';
import { TextDecoder, TextEncoder } from 'util';

import {
  mockDbClientModule,
  mockDrizzleOrm,
} from './src/__fixtures__/db-client-module.testkit';

config();

// createCheckoutSession fails closed when the Stripe price allowlist (read from
// env at schema module load) is empty (LS-7421), so give every spec a
// configured allowlist like a deployed environment has. Specs covering the
// unconfigured case unset it and re-import the schema.
process.env['STRIPE_MONTHLY_PRICE_ID'] = 'price_test';

Object.assign(global, { TextDecoder, TextEncoder });

// The only sanctioned @legacy-sports/db-client and drizzle-orm mock factories
// (see the testkit). Global so a hoisted jest.mock factory can reach them
// whatever the import order.
globalThis.mockDbClientModule = mockDbClientModule;
globalThis.mockDrizzleOrm = mockDrizzleOrm;
