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
 * The only capability these functions need from a database handle.
 *
 * Deliberately structural rather than `InternalDb`: the oauth-proxy download
 * route holds an `InternalDb`, while the admin resolvers in lambdas/db hold a
 * `GenericDatabase<typeof PublicSchema>`. Both address `app_internal.*` through
 * raw `sql` anyway — the schema generic is irrelevant here — so narrowing to
 * `execute` lets one implementation serve both instead of the queries being
 * written twice against the same two tables.
 */
export type AppDownloadDb = Pick<InternalDb, 'execute'>;

/**
 * How a download attempt resolved. Mirrors the `app_internal
 * .app_download_outcome` enum created in the LS-9453 migration.
 *
 * `allowed_admin` is kept distinct from `allowed_listed` on purpose: admins
 * bypass the allowlist, so collapsing the two would make the audit unable to
 * answer "who actually needed to be on the list".
 */
export type AppDownloadOutcome = 'allowed_listed' | 'allowed_admin' | 'denied';

/**
 * One allowlist row as the admin surface renders it.
 *
 * A type alias rather than an interface on purpose: `db.execute<T>` constrains
 * `T` to `Record<string, unknown>`, and only an alias picks up the implicit
 * index signature that satisfies it.
 */
export type AppDownloadAllowlistRow = {
  id: number;
  email: string;
  note: string | null;
  addedByEmail: string | null;
  createdAt: string;
  revokedAt: string | null;
  /** Whether a user account exists for this address yet. Display only. */
  hasAccount: boolean;
  /** When this address last downloaded, or null if it never has. */
  lastDownloadAt: string | null;
};

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
  db: AppDownloadDb,
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
  db: AppDownloadDb,
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

/**
 * Every allowlist row, newest first, with the two display-only joins the admin
 * surface needs.
 *
 * `hasAccount` is a LEFT JOIN and nothing more: an address is listable before
 * its owner signs up (LS-9453 deliberately left `email` free of a foreign key),
 * so this answers "has this person signed in yet" for the admin's benefit and
 * must never become a condition on what can be added.
 */
export async function listAllowlist(
  db: AppDownloadDb,
): Promise<AppDownloadAllowlistRow[]> {
  const result = await db.execute<AppDownloadAllowlistRow>(sql`
    SELECT
      a.id,
      a.email,
      a.note,
      u.canonical_email                        AS "addedByEmail",
      a.created_at                             AS "createdAt",
      a.revoked_at                             AS "revokedAt",
      (acct.id IS NOT NULL)                    AS "hasAccount",
      (
        SELECT max(d.created_at)
        FROM app_internal.app_download_audit d
        WHERE lower(d.email) = lower(a.email)
          AND d.outcome <> 'denied'
      )                                        AS "lastDownloadAt"
    FROM app_internal.app_download_allowlist a
    LEFT JOIN app_internal.users u    ON u.id = a.added_by_user_id
    LEFT JOIN app_internal.users acct ON lower(acct.canonical_email) = lower(a.email)
    ORDER BY a.created_at DESC
  `);

  return result.rows;
}

/**
 * Add an address to the allowlist.
 *
 * Takes a raw string and does not check it against `users` — that is the whole
 * point of the feature: inviting someone who has never signed up is the normal
 * case, and their account is created on first sign-in.
 *
 * Returns null when the address is already listed (in any state), so the caller
 * can report a duplicate rather than silently creating a second row or throwing
 * a constraint error. Matching is on `lower(email)`, the same expression the
 * unique index uses, so casing cannot smuggle a duplicate past it.
 */
export async function addAllowlistEntry(
  db: AppDownloadDb,
  entry: { email: string; note?: string | null; addedByUserId: number },
): Promise<number | null> {
  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO app_internal.app_download_allowlist (email, note, added_by_user_id)
    VALUES (${entry.email.trim()}, ${entry.note ?? null}, ${entry.addedByUserId})
    ON CONFLICT (lower(email)) DO NOTHING
    RETURNING id
  `);

  return result.rows[0]?.id ?? null;
}

/**
 * Revoke or re-instate a row.
 *
 * Revocation is soft — it stamps `revoked_at` rather than deleting — so a
 * re-added tester keeps their history and the audit trail still resolves who
 * they were. Re-instating clears the stamp on the same row for the same reason.
 *
 * Returns false when no row matched, letting the caller distinguish "already in
 * that state" from "no such id" instead of reporting a silent success.
 */
export async function setAllowlistRevoked(
  db: AppDownloadDb,
  id: number,
  revoked: boolean,
): Promise<boolean> {
  const result = await db.execute<{ id: number }>(sql`
    UPDATE app_internal.app_download_allowlist
    SET revoked_at = ${revoked ? sql`now()` : sql`NULL`}
    WHERE id = ${id}
    RETURNING id
  `);

  return result.rows.length > 0;
}
