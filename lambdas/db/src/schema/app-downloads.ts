/**
 * App download allowlist — admin GraphQL surface (LS-9456).
 *
 * Backs /admin/app-downloads. The gated Android download route (LS-9455) reads
 * the same `app_internal.app_download_allowlist` table through the same
 * service functions, so the two never drift on what "allowlisted" means.
 *
 * The defining property of this feature: an address is listable before its
 * owner has an account. LS-9453 deliberately left `email` free of a foreign
 * key, and nothing here joins against `users` to decide what may be added —
 * `hasAccount` is a display-only column so an admin can see who has not signed
 * in yet.
 */

import { LOGGER } from '@legacy-sports/logging';
import {
  addAllowlistEntry,
  type AppDownloadAllowlistRow,
  listAllowlist,
  setAllowlistRevoked,
} from '@legacy-sports/db-client';

import { builder, type Context } from './builder';
import { requireAdmin } from './authorization';

// ── Types ────────────────────────────────────────────────────────────────────

const AppDownloadAllowlistEntry = builder.objectRef<AppDownloadAllowlistRow>(
  'AppDownloadAllowlistEntry',
);

builder.objectType(AppDownloadAllowlistEntry, {
  description: 'One address permitted to download the Android build',
  fields: (t) => ({
    id: t.exposeInt('id'),
    email: t.exposeString('email'),
    note: t.exposeString('note', { nullable: true }),
    addedByEmail: t.exposeString('addedByEmail', { nullable: true }),
    createdAt: t.string({ resolve: (row) => String(row.createdAt) }),
    revokedAt: t.string({
      nullable: true,
      resolve: (row) => (row.revokedAt == null ? null : String(row.revokedAt)),
    }),
    hasAccount: t.exposeBoolean('hasAccount', {
      description:
        'Whether a user account exists for this address yet. Display only — an ' +
        'address may be allowlisted before its owner has ever signed in.',
    }),
    lastDownloadAt: t.string({
      nullable: true,
      description:
        'When this address last downloaded, or null if it never has.',
      resolve: (row) =>
        row.lastDownloadAt == null ? null : String(row.lastDownloadAt),
    }),
  }),
});

interface AllowlistResultShape {
  success: boolean;
  message: string | null;
  entries: AppDownloadAllowlistRow[];
}

const AppDownloadAllowlistResult = builder.objectRef<AllowlistResultShape>(
  'AppDownloadAllowlistResult',
);

builder.objectType(AppDownloadAllowlistResult, {
  description: 'Outcome of an allowlist edit, plus the refreshed list',
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    message: t.exposeString('message', { nullable: true }),
    // The whole list rather than the single affected row: it lets the admin
    // page render the new state without a follow-up round trip, and a rejected
    // edit still returns the list unchanged so the client has one code path.
    entries: t.field({
      type: [AppDownloadAllowlistEntry],
      resolve: (result) => result.entries,
    }),
  }),
});

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Deliberately permissive — one `@`, no whitespace, a dot in the domain.
 *
 * This guards against a typo or an empty submission, not against an address
 * that fails to deliver. A stricter pattern would reject valid addresses and,
 * since nothing is emailed here, would cost an admin a legitimate tester for
 * no benefit.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Resolvers ────────────────────────────────────────────────────────────────

/** Exported for direct unit testing; registered as `appDownloadAllowlist`. */
export async function resolveAppDownloadAllowlist(
  context: Context,
): Promise<AppDownloadAllowlistRow[]> {
  await requireAdmin(context);
  return listAllowlist(context.db);
}

builder.queryField('appDownloadAllowlist', (t) =>
  t.field({
    type: [AppDownloadAllowlistEntry],
    description:
      'Every address on the Android download allowlist, newest first. Admin only.',
    resolve: (_parent, _args, context: Context) =>
      resolveAppDownloadAllowlist(context),
  }),
);

/** Exported for direct unit testing; registered as `addAppDownloadAllowlistEntry`. */
export async function resolveAddAppDownloadAllowlistEntry(
  context: Context,
  args: { email: string; note?: string | null },
): Promise<AllowlistResultShape> {
  const admin = await requireAdmin(context);

  const email = args.email.trim();
  if (!EMAIL_SHAPE.test(email)) {
    return {
      success: false,
      message: `"${email}" does not look like an email address.`,
      entries: await listAllowlist(context.db),
    };
  }

  const note = args.note?.trim() || null;
  const id = await addAllowlistEntry(context.db, {
    email,
    note,
    addedByUserId: admin.id,
  });

  // A null id means the ON CONFLICT fired: the address is already listed, in
  // either state. Reported rather than thrown — a duplicate is an ordinary
  // thing for an admin to do, not an error condition.
  if (id === null) {
    return {
      success: false,
      message: `${email} is already on the allowlist.`,
      entries: await listAllowlist(context.db),
    };
  }

  LOGGER.info('App download allowlist entry added', {
    id,
    addedByUserId: admin.id,
  });

  return {
    success: true,
    message: null,
    entries: await listAllowlist(context.db),
  };
}

builder.mutationField('addAppDownloadAllowlistEntry', (t) =>
  t.field({
    type: AppDownloadAllowlistResult,
    description:
      'Allowlist an address for the Android download. The address need not ' +
      'have a user account — that is the normal case for a new tester. Admin only.',
    args: {
      email: t.arg.string({ required: true }),
      note: t.arg.string({ required: false }),
    },
    resolve: (_parent, args, context: Context) =>
      resolveAddAppDownloadAllowlistEntry(context, args),
  }),
);

/** Exported for direct unit testing; registered as `setAppDownloadAllowlistRevoked`. */
export async function resolveSetAppDownloadAllowlistRevoked(
  context: Context,
  args: { id: number; revoked: boolean },
): Promise<AllowlistResultShape> {
  const admin = await requireAdmin(context);

  const updated = await setAllowlistRevoked(context.db, args.id, args.revoked);
  if (!updated) {
    return {
      success: false,
      message: 'That allowlist entry no longer exists.',
      entries: await listAllowlist(context.db),
    };
  }

  LOGGER.info('App download allowlist entry revocation changed', {
    id: args.id,
    revoked: args.revoked,
    changedByUserId: admin.id,
  });

  return {
    success: true,
    message: null,
    entries: await listAllowlist(context.db),
  };
}

// One mutation with a boolean rather than separate revoke/reinstate fields:
// revocation is soft (a `revoked_at` stamp), so re-instating is the identical
// write with the stamp cleared. Two fields would be two names for one update.
builder.mutationField('setAppDownloadAllowlistRevoked', (t) =>
  t.field({
    type: AppDownloadAllowlistResult,
    description:
      'Revoke an allowlist entry, or re-instate a revoked one. Admin only.',
    args: {
      id: t.arg.int({ required: true }),
      revoked: t.arg.boolean({ required: true }),
    },
    resolve: (_parent, args, context: Context) =>
      resolveSetAppDownloadAllowlistRevoked(context, args),
  }),
);
