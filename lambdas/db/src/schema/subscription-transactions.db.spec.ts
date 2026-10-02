/**
 * subscription_transactions ledger (LS-10396) — real-Postgres guard for the
 * append-only table the Stripe webhook writes to: column conformance, the
 * unique provider_event_id idempotency key, enum constraints, and cascade
 * delete from subscriptions.
 */

import { eq, sql } from 'drizzle-orm';
import {
  getTestDatabase,
  integrationTestInternalSchema,
} from '../../integration-test-setup';
import { getUser } from '../__fixtures__';

const { subscriptions, subscriptionTransactions } =
  integrationTestInternalSchema;

const CUSTOMER_ID = 'cus_ls10396_spec';
const EVENT_PREFIX = 'evt_ls10396_';

describe('subscription_transactions ledger (LS-10396)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;
  const userId = getUser(1).id;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  async function cleanup() {
    // Transactions cascade from the subscription row.
    await db
      .delete(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, CUSTOMER_ID));
  }

  beforeEach(cleanup);
  afterEach(cleanup);

  async function seedSubscription() {
    const [row] = await db
      .insert(subscriptions)
      .values({ userId, stripeCustomerId: CUSTOMER_ID })
      .returning();
    return row;
  }

  const baseEntry = (subscriptionId: number, suffix: string) => ({
    subscriptionId,
    userId,
    provider: 'stripe' as const,
    eventType: 'payment_succeeded' as const,
    amountCents: 999,
    currency: 'usd',
    providerEventId: `${EVENT_PREFIX}${suffix}`,
    occurredAt: new Date('2026-10-01T00:00:00Z'),
  });

  it('persists a row with every column and defaults created_at', async () => {
    const sub = await seedSubscription();

    const [row] = await db
      .insert(subscriptionTransactions)
      .values(baseEntry(sub.id, 'a'))
      .returning();

    expect(row).toMatchObject({
      subscriptionId: sub.id,
      userId,
      provider: 'stripe',
      eventType: 'payment_succeeded',
      amountCents: 999,
      currency: 'usd',
      providerEventId: `${EVENT_PREFIX}a`,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('allows null amount_cents and currency', async () => {
    const sub = await seedSubscription();

    const [row] = await db
      .insert(subscriptionTransactions)
      .values({
        ...baseEntry(sub.id, 'nulls'),
        amountCents: null,
        currency: null,
      })
      .returning();

    expect(row.amountCents).toBeNull();
    expect(row.currency).toBeNull();
  });

  it('onConflictDoNothing on provider_event_id does not create a duplicate row', async () => {
    const sub = await seedSubscription();
    const entry = baseEntry(sub.id, 'dup');

    await db.insert(subscriptionTransactions).values(entry);
    await db
      .insert(subscriptionTransactions)
      .values(entry)
      .onConflictDoNothing({
        target: subscriptionTransactions.providerEventId,
      });

    const rows = await db
      .select()
      .from(subscriptionTransactions)
      .where(
        eq(subscriptionTransactions.providerEventId, entry.providerEventId),
      );
    expect(rows).toHaveLength(1);
  });

  it('rejects a duplicate provider_event_id without ON CONFLICT', async () => {
    const sub = await seedSubscription();
    const entry = baseEntry(sub.id, 'unique');
    await db.insert(subscriptionTransactions).values(entry);

    await expect(
      db.insert(subscriptionTransactions).values(entry),
    ).rejects.toThrow();
  });

  it('rejects an event_type outside the enum', async () => {
    const sub = await seedSubscription();

    await expect(
      db.execute(sql`
        INSERT INTO app_internal.subscription_transactions
          (subscription_id, user_id, provider, event_type, provider_event_id, occurred_at)
        VALUES
          (${sub.id}, ${userId}, 'stripe', 'chargeback', ${`${EVENT_PREFIX}bad-type`}, NOW())
      `),
    ).rejects.toThrow();
  });

  it('rejects a provider outside the enum', async () => {
    const sub = await seedSubscription();

    await expect(
      db.execute(sql`
        INSERT INTO app_internal.subscription_transactions
          (subscription_id, user_id, provider, event_type, provider_event_id, occurred_at)
        VALUES
          (${sub.id}, ${userId}, 'paypal', 'refund', ${`${EVENT_PREFIX}bad-provider`}, NOW())
      `),
    ).rejects.toThrow();
  });

  it('cascades deletes from subscriptions', async () => {
    const sub = await seedSubscription();
    await db
      .insert(subscriptionTransactions)
      .values([
        baseEntry(sub.id, 'c1'),
        { ...baseEntry(sub.id, 'c2'), eventType: 'refund' as const },
      ]);

    await db.delete(subscriptions).where(eq(subscriptions.id, sub.id));

    const rows = await db
      .select()
      .from(subscriptionTransactions)
      .where(eq(subscriptionTransactions.subscriptionId, sub.id));
    expect(rows).toHaveLength(0);
  });

  it('has an index on subscription_id', async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'app_internal'
        AND tablename = 'subscription_transactions'
        AND indexname = 'subscription_transactions_subscription_id_idx'
    `);
    expect(result.rows).toHaveLength(1);
  });
});
