/**
 * CLI command: seed-stripe
 *
 * Idempotent Stripe test-mode seed for subscription features, product, and prices.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... ls-cli seed-stripe
 *
 * Run as many times as you like — every object is identified by a stable
 * `lookup_key` (features and prices) or a metadata key (product). Re-running
 * the command will:
 *   - find existing objects by their lookup key and leave them in place
 *   - create anything that's missing
 *   - reconcile feature-to-product attachments (add missing, leave extras)
 *
 * This command refuses to run against a live-mode key — it will abort if
 * STRIPE_SECRET_KEY starts with `sk_live_`. Live-mode provisioning should
 * be a deliberate, reviewed change, not an autorun.
 *
 * On success it prints the monthly / annual price IDs so you can paste them
 * into `.env.local` (STRIPE_MONTHLY_PRICE_ID / STRIPE_ANNUAL_PRICE_ID).
 */

import Stripe from 'stripe';
import { LOGGER } from '@legacy-sports/logging';
import {
  ENTITLEMENT_LABELS,
  type EntitlementKey,
  ENTITLEMENTS,
} from '@legacy-sports/utils';

// ── Config ───────────────────────────────────────────────────────────────────

const PRODUCT_METADATA_KEY = 'legacy_sports_product';
const PRODUCT_METADATA_VALUE = 'premium';

interface FeatureSpec {
  lookup_key: EntitlementKey;
  name: string;
}

// Derive the feature list from the single source of truth in
// `lambdas/db/src/schema/entitlements.ts` so gating code and Stripe
// provisioning cannot drift.
const FEATURES: FeatureSpec[] = (
  Object.values(ENTITLEMENTS) as EntitlementKey[]
).map((lookup_key) => ({
  lookup_key,
  name: ENTITLEMENT_LABELS[lookup_key],
}));

interface ProductSpec {
  name: string;
  description: string;
  /** Entitlement lookup_keys attached to this product. */
  features: string[];
}

const PRODUCT: ProductSpec = {
  name: 'Legacy Sports Premium',
  description:
    'Unlock salary-cap leagues, advanced playoff formats, unlimited mock drafts, unlimited active leagues, FAAB waivers, and historical era filters.',
  features: FEATURES.map((f) => f.lookup_key),
};

interface PriceSpec {
  lookup_key: string;
  nickname: string;
  unit_amount: number;
  interval: 'month' | 'year';
  interval_count: number;
}

export const PRICES: PriceSpec[] = [
  {
    lookup_key: 'premium_monthly',
    nickname: 'Premium — Monthly',
    unit_amount: 499,
    interval: 'month',
    interval_count: 1,
  },
  {
    lookup_key: 'premium_annual',
    nickname: 'Premium — Annual',
    unit_amount: 3999,
    interval: 'year',
    interval_count: 1,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate the Stripe secret key: it must be set and must not be a live-mode
 * key. Returns the validated key so callers can use it without re-reading env.
 */
export function assertTestModeKey(key: string | undefined): string {
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (key.startsWith('sk_live_')) {
    throw new Error(
      'Refusing to run against a live-mode key. Use a test-mode key (sk_test_...).',
    );
  }
  return key;
}

export async function upsertFeature(
  stripe: Stripe,
  spec: FeatureSpec,
): Promise<Stripe.Entitlements.Feature> {
  const existing = await stripe.entitlements.features.list({
    lookup_key: spec.lookup_key,
    limit: 1,
  });
  if (existing.data.length > 0) {
    LOGGER.info(
      `  feature[${spec.lookup_key}] exists (${existing.data[0].id}) — leaving in place`,
    );
    return existing.data[0];
  }
  const created = await stripe.entitlements.features.create({
    name: spec.name,
    lookup_key: spec.lookup_key,
  });
  LOGGER.info(`  feature[${spec.lookup_key}] created (${created.id})`);
  return created;
}

export async function findProductByMetadata(
  stripe: Stripe,
): Promise<Stripe.Product | null> {
  // Stripe has no direct "list by metadata" filter. Iterate all products
  // (including inactive) so a deactivated tagged product is reused rather
  // than duplicated — Stripe allows multiple products with the same name but
  // a re-run should never fork our tagged product into a second row.
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (product.metadata?.[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE) {
      return product;
    }
  }
  return null;
}

export async function upsertProduct(stripe: Stripe): Promise<Stripe.Product> {
  const existing = await findProductByMetadata(stripe);
  if (existing) {
    if (!existing.active) {
      LOGGER.warn(
        `  product exists (${existing.id}) but is inactive — leaving as-is. ` +
          `Reactivate it in the Stripe dashboard before running checkout.`,
      );
    } else {
      LOGGER.info(`  product exists (${existing.id}) — leaving in place`);
    }
    return existing;
  }
  const created = await stripe.products.create({
    name: PRODUCT.name,
    description: PRODUCT.description,
    metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
  });
  LOGGER.info(`  product created (${created.id})`);
  return created;
}

export async function attachProductFeatures(
  stripe: Stripe,
  productId: string,
  featureIdsByLookupKey: Map<string, string>,
): Promise<void> {
  const existing = await stripe.products.listFeatures(productId, {
    limit: 100,
  });
  const attachedFeatureIds = new Set(
    existing.data
      .map((f) => f.entitlement_feature?.id)
      .filter((id): id is string => Boolean(id)),
  );

  for (const lookupKey of PRODUCT.features) {
    const featureId = featureIdsByLookupKey.get(lookupKey);
    if (!featureId) {
      throw new Error(
        `Feature lookup_key ${lookupKey} was not created — cannot attach to product`,
      );
    }
    if (attachedFeatureIds.has(featureId)) {
      LOGGER.info(`  product feature[${lookupKey}] already attached`);
      continue;
    }
    await stripe.products.createFeature(productId, {
      entitlement_feature: featureId,
    });
    LOGGER.info(`  product feature[${lookupKey}] attached`);
  }
}

export async function upsertPrice(
  stripe: Stripe,
  productId: string,
  spec: PriceSpec,
): Promise<Stripe.Price> {
  // List without the `active` filter so we detect inactive prices that still
  // hold the lookup_key — Stripe will reject a create with a conflicting
  // lookup_key, so we surface a clear warning instead of letting the
  // attempted create fail opaquely.
  const existing = await stripe.prices.list({
    lookup_keys: [spec.lookup_key],
    limit: 100,
  });
  const price = existing.data.find((p) => p.active) ?? existing.data[0] ?? null;
  if (price) {
    if (!price.active) {
      LOGGER.warn(
        `  price[${spec.lookup_key}] exists (${price.id}) but is inactive — leaving as-is. ` +
          `Stripe will reject a create with the same lookup_key; reactivate ${price.id} ` +
          `or remove its lookup_key in the dashboard, then re-run this command.`,
      );
      return price;
    }
    const mismatch =
      price.unit_amount !== spec.unit_amount ||
      price.recurring?.interval !== spec.interval ||
      price.product !== productId;
    if (mismatch) {
      LOGGER.warn(
        `  price[${spec.lookup_key}] exists (${price.id}) but its amount/interval/product differs from the spec. ` +
          `Stripe prices are immutable — to change pricing, deactivate ${price.id} manually in the dashboard, ` +
          `remove its lookup_key, then re-run this command.`,
      );
    } else {
      LOGGER.info(
        `  price[${spec.lookup_key}] exists (${price.id}) — leaving in place`,
      );
    }
    return price;
  }
  const created = await stripe.prices.create({
    product: productId,
    lookup_key: spec.lookup_key,
    nickname: spec.nickname,
    unit_amount: spec.unit_amount,
    currency: 'usd',
    recurring: {
      interval: spec.interval,
      interval_count: spec.interval_count,
    },
  });
  LOGGER.info(
    `  price[${spec.lookup_key}] created (${created.id}, ${created.unit_amount}¢ / ${spec.interval})`,
  );
  return created;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Run the full idempotent seed against a configured Stripe client and return
 * the resolved monthly / annual price IDs.
 */
export async function seedStripe(
  stripe: Stripe,
): Promise<{ monthlyPriceId?: string; annualPriceId?: string }> {
  LOGGER.info('Features:');
  const featureIdsByLookupKey = new Map<string, string>();
  for (const spec of FEATURES) {
    const feature = await upsertFeature(stripe, spec);
    featureIdsByLookupKey.set(spec.lookup_key, feature.id);
  }

  LOGGER.info('Product:');
  const product = await upsertProduct(stripe);

  LOGGER.info('Product feature attachments:');
  await attachProductFeatures(stripe, product.id, featureIdsByLookupKey);

  LOGGER.info('Prices:');
  const pricesByLookupKey = new Map<string, Stripe.Price>();
  for (const spec of PRICES) {
    const price = await upsertPrice(stripe, product.id, spec);
    pricesByLookupKey.set(spec.lookup_key, price);
  }

  return {
    monthlyPriceId: pricesByLookupKey.get('premium_monthly')?.id,
    annualPriceId: pricesByLookupKey.get('premium_annual')?.id,
  };
}

// ── Command handler ───────────────────────────────────────────────────────────

export async function handleSeedStripe(): Promise<void> {
  const key = assertTestModeKey(process.env['STRIPE_SECRET_KEY']);

  const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });

  const { monthlyPriceId, annualPriceId } = await seedStripe(stripe);

  LOGGER.info('─── Seed complete ───────────────────────────────────────');
  LOGGER.info('Paste into .env.local / secrets:');
  LOGGER.info(`  STRIPE_MONTHLY_PRICE_ID=${monthlyPriceId ?? '<missing>'}`);
  LOGGER.info(`  STRIPE_ANNUAL_PRICE_ID=${annualPriceId ?? '<missing>'}`);
}
