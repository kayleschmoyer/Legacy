/**
 * checkAndIncrementRateLimit — persisted per-user rate limiter (LS-8587 / BTD-003)
 *
 * Exercises the real UPSERT/CASE logic against Postgres: the first attempt is
 * allowed and creates the counter row, attempts within the window increment
 * and are rejected once the limit is reached, a new window resets the
 * counter, and concurrent attempts for the same user never lose an update
 * (the property that rules out an in-memory, per-instance counter — see
 * lambdas/oauth-proxy/src/util/rate-limit.ts — for this use case).
 */
import { sql } from 'drizzle-orm';
import { checkAndIncrementRateLimit } from './rate-limit';
import { getTestDatabase, TEST_USERS } from '../../integration-test-setup';

const TEST_BUCKET = 'rate-limit-spec';
const USER_A = TEST_USERS[0].id;
const USER_B = TEST_USERS[1].id;
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('checkAndIncrementRateLimit', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await db.execute(
      sql`DELETE FROM rate_limit_counters WHERE bucket = ${TEST_BUCKET}`,
    );
  });

  afterAll(async () => {
    await db.execute(
      sql`DELETE FROM rate_limit_counters WHERE bucket = ${TEST_BUCKET}`,
    );
  });

  it('allows the first attempt and creates the counter row', async () => {
    const result = await checkAndIncrementRateLimit(db, {
      bucket: TEST_BUCKET,
      userId: USER_A,
      limit: 3,
      windowMs: ONE_HOUR_MS,
    });

    expect(result.allowed).toBe(true);
  });

  it('allows attempts up to the limit, then rejects further attempts in the same window', async () => {
    const options = {
      bucket: TEST_BUCKET,
      userId: USER_A,
      limit: 3,
      windowMs: ONE_HOUR_MS,
    };

    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(true);
    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(true);
    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(true);
    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(false);
    // Still rejected — exceeding the limit does not reset it early.
    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(false);
  });

  it('resets the counter once the window has elapsed', async () => {
    const options = {
      bucket: TEST_BUCKET,
      userId: USER_A,
      limit: 1,
      windowMs: ONE_HOUR_MS,
    };

    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(true);
    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(false);

    // Simulate the window having elapsed by backdating window_start — this
    // is the state the row would be in an hour after the first attempt.
    await db.execute(
      sql`UPDATE rate_limit_counters SET window_start = now() - interval '2 hours' WHERE bucket = ${TEST_BUCKET} AND user_id = ${USER_A}`,
    );

    expect((await checkAndIncrementRateLimit(db, options)).allowed).toBe(true);
  });

  it('tracks separate users independently under the same bucket', async () => {
    const optionsFor = (userId: number) => ({
      bucket: TEST_BUCKET,
      userId,
      limit: 1,
      windowMs: ONE_HOUR_MS,
    });

    expect(
      (await checkAndIncrementRateLimit(db, optionsFor(USER_A))).allowed,
    ).toBe(true);
    expect(
      (await checkAndIncrementRateLimit(db, optionsFor(USER_B))).allowed,
    ).toBe(true);
    // USER_A is already at its limit; USER_B's attempt above must not count
    // against it.
    expect(
      (await checkAndIncrementRateLimit(db, optionsFor(USER_A))).allowed,
    ).toBe(false);
  });

  it('never loses an update under concurrent attempts for the same user', async () => {
    const options = {
      bucket: TEST_BUCKET,
      userId: USER_A,
      limit: 10,
      windowMs: ONE_HOUR_MS,
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkAndIncrementRateLimit(db, options)),
    );
    expect(results.filter((r) => r.allowed).length).toBe(10);

    // The 11th attempt, issued only after all 10 concurrent ones have
    // resolved, must be rejected — proving none of the 10 increments were
    // lost to a race (the failure mode an in-memory, per-instance counter
    // cannot avoid across concurrent Lambda instances).
    const eleventh = await checkAndIncrementRateLimit(db, options);
    expect(eleventh.allowed).toBe(false);
  });
});
