/**
 * App download allowlist + audit access (LS-9455).
 *
 * Backs the gated Android APK download: the oauth-proxy route asks whether an
 * address may download and records what happened, and the admin surface
 * (LS-9456) reads and edits the same two tables.
 *
 * Both tables live in `app_internal` and are reached with raw `sql` templates
 * rather than the drizzle query builder — they are outside the generated
 * `internal` schema, which is the same reason `lambdas/db/src/schema/
 * account-merge.ts` addresses `app_internal.users` this way. Values are still
 * parameterised by drizzle's `sql` tag, never interpolated.
 */

import { sql } from 'drizzle-orm';
import type { InternalDb } from '../client/InternalDbClient';

/**
 * How a download attempt resolved. Mirrors the `app_internal
 * .app_download_outcome` enum created in the LS-9453 migration.
 *
 * `allowed_admin` is kept distinct from `allowed_listed` on purpose: admins
 * bypass the allowlist, so collapsing the two would make the audit unable to
 * answer "who actually needed to be on the list".
 */
export type AppDownloadOutcome = 'allowed_listed' | 'allowed_admin' | 'denied';

export interface AppDownloadAttempt {
  email: string;
  outcome: AppDownloadOutcome;
  /** Version string of the APK served, when one was. */
  apkVersion?: string | null;
  userAgent?: string | null;
}

/**
 * Whether this address currently holds an unrevoked allowlist row.
 *
 * Matching is case-insensitive via `lower(email)`, which is also how the
 * unique index is defined — nothing in this codebase lowercases emails before
 * storing them, so both sides must normalise or a tester whose provider
 * reports `Name@example.com` would not match the row an admin typed in
 * lowercase.
 */
export async function isEmailAllowlisted(
  db: InternalDb,
  email: string,
): Promise<boolean> {
  // `db.execute` rather than the query builder: `.from(sql\`app_internal.x\`)`
  // degrades drizzle's generic to `never` for a table outside the generated
  // schema, so the awaited result is not indexable and TS2488s at the call
  // site. Executing the statement directly keeps the row type explicit and
  // matches how recordDownloadAttempt below writes.
  const result = await db.execute<{ present: number }>(sql`
    SELECT 1 AS present
    FROM app_internal.app_download_allowlist
    WHERE lower(email) = lower(${email})
      AND revoked_at IS NULL
    LIMIT 1
  `);

  return result.rows.length > 0;
}

/**
 * Record one download attempt. Called for grants and denials alike — a denial
 * is the more interesting row, since it is how an admin learns someone is
 * trying to install and needs adding.
 */
export async function recordDownloadAttempt(
  db: InternalDb,
  attempt: AppDownloadAttempt,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO app_internal.app_download_audit
      (email, outcome, apk_version, user_agent)
    VALUES (
      ${attempt.email},
      ${attempt.outcome}::app_internal.app_download_outcome,
      ${attempt.apkVersion ?? null},
      ${attempt.userAgent ?? null}
    )
  `);
}
