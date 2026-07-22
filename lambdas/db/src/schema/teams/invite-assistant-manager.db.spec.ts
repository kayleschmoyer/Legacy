/**
 * inviteAssistantManager — case-insensitive username lookup (LS-6026 / BTD-003)
 *
 * Prior to this fix, the invitee lookup used `eq(users.username, ...)`, so a
 * GM typing a real username with different casing than it was stored got a
 * false "no such user" error. This exercises the exact query pattern the
 * resolver now uses (`ilike`) against a real Postgres to prove the match is
 * case-insensitive.
 */
import { ilike, sql } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestInternalSchema,
  integrationTestSchema,
} from '../../../integration-test-setup';

const { users } = integrationTestSchema;
const { usersInAppInternal } = integrationTestInternalSchema;

// Isolated to this spec via a dedicated email domain — cleaned up independently
// of the shared TEST_USERS / league-graph cleanup in cleanupTestData().
const MIXED_CASE_USER = {
  id: 210,
  canonicalEmail: 'mixed-case-210@invite-spec.example.com',
  username: 'BobTheManager',
  accessLevel: 'none' as const,
};

describe('inviteAssistantManager - case-insensitive username lookup (LS-6026)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM app_internal.users WHERE canonical_email LIKE '%@invite-spec.example.com'`,
    );
    await db.insert(usersInAppInternal).values(MIXED_CASE_USER);
  });

  afterEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM app_internal.users WHERE canonical_email LIKE '%@invite-spec.example.com'`,
    );
  });

  it('finds the invitee when the caller types different case than stored', async () => {
    const rows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(ilike(users.username, 'bobthemanager'.trim()))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(MIXED_CASE_USER.id);
  });

  it('finds the invitee regardless of which case variant is typed', async () => {
    for (const typed of ['BOBTHEMANAGER', 'bobthemanager', 'BobTheManager']) {
      const rows = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(ilike(users.username, typed.trim()))
        .limit(1);

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(MIXED_CASE_USER.id);
    }
  });

  it('still returns no match for a genuinely nonexistent username', async () => {
    const rows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(ilike(users.username, 'nobody-with-this-handle'.trim()))
      .limit(1);

    expect(rows).toHaveLength(0);
  });
});
