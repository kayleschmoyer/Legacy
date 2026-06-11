import { LOGGER } from '@legacy-sports/logging';
import { runWithInternalClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { sql } from 'drizzle-orm';

export interface FindDuplicateAccountsArgs {
  limit?: number;
  format?: 'table' | 'json';
}

interface DuplicatePair {
  userAId: number;
  userAEmail: string;
  userBId: number;
  userBEmail: string;
  matchType: string;
  sharedEmail: string;
}

export async function handleFindDuplicateAccounts(
  args: FindDuplicateAccountsArgs,
): Promise<void> {
  const { limit = 100, format = 'table' } = args;
  const opts = getDbOptions();

  await runWithInternalClient(opts, async (db) => {
    LOGGER.info('🔍 Scanning for duplicate account pairs...');

    const result = await db.execute<{
      user_a_id: number;
      user_a_email: string;
      user_b_id: number;
      user_b_email: string;
      match_type: string;
      shared_email: string;
    }>(sql`
      SELECT DISTINCT
        LEAST(id1, id2)                                 AS user_a_id,
        CASE WHEN id1 < id2 THEN email1 ELSE email2 END AS user_a_email,
        GREATEST(id1, id2)                              AS user_b_id,
        CASE WHEN id1 < id2 THEN email2 ELSE email1 END AS user_b_email,
        match_type,
        shared_email
      FROM (
        -- A's canonical_email appears as an identity email on B
        SELECT
          u1.id              AS id1,
          u2.id              AS id2,
          u1.canonical_email AS email1,
          u2.canonical_email AS email2,
          'canonical_matches_identity'::text AS match_type,
          ui.provider_email  AS shared_email
        FROM app_internal.users u1
        JOIN app_internal.user_identities ui
          ON ui.provider_email = u1.canonical_email
        JOIN app_internal.users u2
          ON u2.id = ui.user_id AND u2.id != u1.id
        WHERE u1.canonical_email NOT LIKE 'merged-%@deactivated.local'
          AND u2.canonical_email NOT LIKE 'merged-%@deactivated.local'

        UNION ALL

        -- Two different users share the same non-null provider_email
        SELECT
          u1.id              AS id1,
          u2.id              AS id2,
          u1.canonical_email AS email1,
          u2.canonical_email AS email2,
          'shared_identity_email'::text AS match_type,
          ui1.provider_email AS shared_email
        FROM app_internal.user_identities ui1
        JOIN app_internal.user_identities ui2
          ON  ui1.provider_email = ui2.provider_email
          AND ui1.user_id < ui2.user_id
          AND ui1.provider_email IS NOT NULL
        JOIN app_internal.users u1 ON u1.id = ui1.user_id
        JOIN app_internal.users u2 ON u2.id = ui2.user_id
        WHERE u1.canonical_email NOT LIKE 'merged-%@deactivated.local'
          AND u2.canonical_email NOT LIKE 'merged-%@deactivated.local'
      ) AS sub
      ORDER BY user_a_id, user_b_id
      LIMIT ${limit}
    `);

    const pairs: DuplicatePair[] = result.rows.map((row) => ({
      userAId: Number(row.user_a_id),
      userAEmail: row.user_a_email,
      userBId: Number(row.user_b_id),
      userBEmail: row.user_b_email,
      matchType: row.match_type,
      sharedEmail: row.shared_email,
    }));

    if (pairs.length === 0) {
      if (format === 'json') {
        LOGGER.info('[]');
      } else {
        LOGGER.info('✅ No duplicate account pairs detected.');
      }
      return;
    }

    if (format === 'json') {
      LOGGER.info(JSON.stringify(pairs, null, 2));
      return;
    }

    LOGGER.info(`\n📋 Found ${pairs.length} candidate duplicate pair(s):\n`);
    LOGGER.info(
      `${'ID-A'.padEnd(8)} ${'Email-A'.padEnd(36)} ${'ID-B'.padEnd(8)} ${'Email-B'.padEnd(36)} ${'Match'.padEnd(28)} Shared Email`,
    );
    LOGGER.info('-'.repeat(130));
    for (const p of pairs) {
      LOGGER.info(
        `${String(p.userAId).padEnd(8)} ${p.userAEmail.padEnd(36)} ${String(p.userBId).padEnd(8)} ${p.userBEmail.padEnd(36)} ${p.matchType.padEnd(28)} ${p.sharedEmail}`,
      );
    }
    LOGGER.info('');
    LOGGER.info(
      '💡 To inspect a pair: merge-accounts --primary-id <id> --secondary-id <id> --dry-run',
    );
  });
}
