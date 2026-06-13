import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { TakeUniqueOrNull, TakeUniqueOrThrow } from './utils/TakeUniqueOrThrow';
import { GenericDatabase } from './abstract/BaseDbClient';
import { InternalUser } from '../../types/DatabaseTypes';
import * as Schema from '../../drizzle/internal/schema';

export const InternalSchema = Schema;

export type InternalDb = GenericDatabase<typeof Schema>;

/** A single `app_internal.user_identities` row, including the provider's raw
 * account id (which is omitted from the public view). */
export type InternalUserIdentity = typeof Schema.userIdentities.$inferSelect;

/** The provider discriminator: 'local' | 'discord' | 'google' | 'apple'. */
export type IdentityProvider = InternalUserIdentity['provider'];

/** Fields for inserting/linking a `user_identities` row (LS-7823). */
export interface NewIdentityInput {
  userId: number;
  provider: IdentityProvider;
  /** Provider-side subject id (Discord snowflake, Google/Apple `sub`). NULL for
   * 'local'. */
  providerAccountId: string | null;
  providerEmail?: string | null;
  providerEmailVerified?: boolean;
  providerUsername?: string | null;
  providerAvatar?: string | null;
}

export async function createUser(
  db: InternalDb,
  email: string,
  password?: string,
): Promise<InternalUser> {
  const internalUser = {
    canonicalEmail: email,
    passwordHash: password,
    username: email,
  };

  return await db
    .insert(Schema.usersInAppInternal)
    .values(internalUser)
    .returning()
    .then(TakeUniqueOrThrow);
}

export async function getUserByEmail(
  db: InternalDb,
  email: string,
): Promise<InternalUser | null> {
  return await db
    .select()
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.canonicalEmail, email))
    .then(TakeUniqueOrNull);
}

export async function getUserById(
  db: InternalDb,
  id: number,
): Promise<InternalUser | null> {
  return await db
    .select()
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.id, id))
    .then(TakeUniqueOrNull);
}

// ── user_identities (LS-7823, multi-provider identity) ───────────────────────
//
// These operate over the app_internal.user_identities table introduced in Phase
// 1 (LS-7822). They are the building blocks for the shared resolveOrCreateUser
// resolver and the provider-agnostic link/unlink flow that replace the legacy
// per-provider, email-only lookups.

/**
 * Look up a linked identity by its provider account key
 * `(provider, providerAccountId)`. This is the primary sign-in lookup — a
 * returning user is matched by their stable provider subject id rather than by
 * a (potentially changed) email. Returns null when the provider account is not
 * linked to any user.
 */
export async function getIdentityByProviderAccount(
  db: InternalDb,
  provider: IdentityProvider,
  providerAccountId: string,
): Promise<InternalUserIdentity | null> {
  return await db
    .select()
    .from(Schema.userIdentities)
    .where(
      and(
        eq(Schema.userIdentities.provider, provider),
        eq(Schema.userIdentities.providerAccountId, providerAccountId),
      ),
    )
    .then(TakeUniqueOrNull);
}

/**
 * Look up a user's identity for a given provider (regardless of account id).
 * Used to detect "this user already has that provider linked" before linking a
 * new provider account. The `(user_id, provider)` unique constraint guarantees
 * at most one row.
 */
export async function getIdentityByUserProvider(
  db: InternalDb,
  userId: number,
  provider: IdentityProvider,
): Promise<InternalUserIdentity | null> {
  return await db
    .select()
    .from(Schema.userIdentities)
    .where(
      and(
        eq(Schema.userIdentities.userId, userId),
        eq(Schema.userIdentities.provider, provider),
      ),
    )
    .then(TakeUniqueOrNull);
}

/**
 * All linked identities for a user, ordered oldest-first by `linked_at`. The
 * link order is the tie-breaker the canonical-email re-derivation uses on
 * unlink ("oldest verified wins"). Includes the raw provider account id, so
 * this is the internal-schema accessor (the public view omits it).
 */
export async function getUserIdentities(
  db: InternalDb,
  userId: number,
): Promise<InternalUserIdentity[]> {
  return await db
    .select()
    .from(Schema.userIdentities)
    .where(eq(Schema.userIdentities.userId, userId))
    .orderBy(
      asc(Schema.userIdentities.linkedAt),
      asc(Schema.userIdentities.id),
    );
}

/** Insert a new `user_identities` row. Throws on unique-constraint violations
 * — callers that need friendly conflicts should pre-check via `linkIdentity`. */
export async function createIdentity(
  db: InternalDb,
  input: NewIdentityInput,
): Promise<InternalUserIdentity> {
  return await db
    .insert(Schema.userIdentities)
    .values({
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId ?? null,
      providerEmail: input.providerEmail ?? null,
      providerEmailVerified: input.providerEmailVerified ?? false,
      providerUsername: input.providerUsername ?? null,
      providerAvatar: input.providerAvatar ?? null,
    })
    .returning()
    .then(TakeUniqueOrThrow);
}

/**
 * Refresh the provider-reported fields and stamp `last_login_at` on an existing
 * identity after a successful sign-in. Only the fields that are passed are
 * updated, so a caller can refresh just the email (or just the avatar) without
 * clobbering the others.
 */
export async function touchIdentityOnLogin(
  db: InternalDb,
  identityId: number,
  fields: {
    providerEmail?: string | null;
    providerEmailVerified?: boolean;
    providerUsername?: string | null;
    providerAvatar?: string | null;
  } = {},
): Promise<void> {
  await db
    .update(Schema.userIdentities)
    .set({
      ...(fields.providerEmail !== undefined
        ? { providerEmail: fields.providerEmail }
        : {}),
      ...(fields.providerEmailVerified !== undefined
        ? { providerEmailVerified: fields.providerEmailVerified }
        : {}),
      ...(fields.providerUsername !== undefined
        ? { providerUsername: fields.providerUsername }
        : {}),
      ...(fields.providerAvatar !== undefined
        ? { providerAvatar: fields.providerAvatar }
        : {}),
      lastLoginAt: new Date(),
    })
    .where(eq(Schema.userIdentities.id, identityId));
}

/** Delete a user's identity for a provider. Returns the deleted row, or null
 * when the user had no identity for that provider. */
export async function deleteIdentity(
  db: InternalDb,
  userId: number,
  provider: IdentityProvider,
): Promise<InternalUserIdentity | null> {
  return await db
    .delete(Schema.userIdentities)
    .where(
      and(
        eq(Schema.userIdentities.userId, userId),
        eq(Schema.userIdentities.provider, provider),
      ),
    )
    .returning()
    .then(TakeUniqueOrNull);
}

/** Result of an email-owner lookup. `ambiguous` is true only when the
 * identity-email fallback matches more than one distinct user (legacy/unverified
 * data) — callers must fail closed in that case. */
export interface EmailOwnerLookup {
  user: InternalUser | null;
  ambiguous: boolean;
}

/**
 * Find the user who "owns" an email, with the precedence the multi-provider
 * design mandates: canonical email first, identity email second.
 *
 * 1. Canonical match — `users.canonical_email` is unique, so at most one row. A
 *    canonical match always wins.
 * 2. Identity-email fallback — only when there is no canonical match, look for a
 *    `user_identities.provider_email` match. `LIMIT 2` lets us detect the
 *    ambiguous case (the same email on two different users, only possible via
 *    unverified/legacy data) and fail closed rather than guess.
 */
export async function getUserByCanonicalEmailOrIdentityEmail(
  db: InternalDb,
  email: string,
): Promise<EmailOwnerLookup> {
  const canonical = await getUserByEmail(db, email);
  if (canonical) {
    return { user: canonical, ambiguous: false };
  }

  const rows = await db
    .select({ userId: Schema.userIdentities.userId })
    .from(Schema.userIdentities)
    .where(eq(Schema.userIdentities.providerEmail, email))
    .limit(2);

  if (rows.length === 0) {
    return { user: null, ambiguous: false };
  }
  if (rows.length > 1 && rows[0].userId !== rows[1].userId) {
    return { user: null, ambiguous: true };
  }

  const user = await getUserById(db, rows[0].userId);
  return { user, ambiguous: false };
}

/**
 * Set a user's canonical email and the identity it tracks together, after the
 * caller has confirmed the new email is free of the unique constraint.
 */
export async function setCanonicalEmail(
  db: InternalDb,
  userId: number,
  email: string,
  source: IdentityProvider,
): Promise<InternalUser> {
  return await db
    .update(Schema.usersInAppInternal)
    .set({
      canonicalEmail: email,
      canonicalEmailSource: source,
      updatedAt: new Date(),
    })
    .where(eq(Schema.usersInAppInternal.id, userId))
    .returning()
    .then(TakeUniqueOrThrow);
}

/** Record which linked identity the canonical email tracks, without touching
 * the email value itself (used when a user is created and on re-derivation). */
export async function setCanonicalEmailSource(
  db: InternalDb,
  userId: number,
  source: IdentityProvider | null,
): Promise<void> {
  await db
    .update(Schema.usersInAppInternal)
    .set({ canonicalEmailSource: source, updatedAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId));
}

/** Outcome of {@link linkIdentity}. */
export type LinkIdentityResult =
  | { ok: true; identity: InternalUserIdentity }
  | { ok: false; reason: 'PROVIDER_ACCOUNT_TAKEN' | 'ALREADY_LINKED' };

/**
 * Provider-agnostic link of an identity onto a user. Enforces both link rules
 * up front so the caller can return a friendly 409:
 * - `PROVIDER_ACCOUNT_TAKEN` — that provider account is linked to another user.
 * - `ALREADY_LINKED` — the user already has a (different) identity for this
 *   provider.
 *
 * Re-linking the *same* provider account already owned by the user is a no-op
 * that returns the existing row (idempotent).
 */
export async function linkIdentity(
  db: InternalDb,
  input: NewIdentityInput & { providerAccountId: string },
): Promise<LinkIdentityResult> {
  const existing = await getIdentityByProviderAccount(
    db,
    input.provider,
    input.providerAccountId,
  );
  if (existing) {
    if (existing.userId !== input.userId) {
      return { ok: false, reason: 'PROVIDER_ACCOUNT_TAKEN' };
    }
    return { ok: true, identity: existing };
  }

  const userProvider = await getIdentityByUserProvider(
    db,
    input.userId,
    input.provider,
  );
  if (userProvider) {
    return { ok: false, reason: 'ALREADY_LINKED' };
  }

  const identity = await createIdentity(db, input);
  return { ok: true, identity };
}

/** Outcome of {@link unlinkIdentity}. */
export type UnlinkIdentityResult =
  | { ok: true; rederived: boolean }
  | { ok: false; reason: 'NOT_LINKED' | 'LAST_IDENTITY' };

/**
 * Provider-agnostic unlink. Enforces the design's two unlink rules:
 * - **Reachability guard** — refuse to remove the last identity unless a local
 *   password remains, so the account never becomes unreachable.
 * - **Canonical re-derivation** — if the unlinked identity was the canonical
 *   email source, re-derive canonical from the remaining identities by link
 *   order (oldest verified wins). When no remaining identity has a verified
 *   email, the email is left unchanged (account stays reachable) and the source
 *   is cleared to the manual-override state.
 */
export async function unlinkIdentity(
  db: InternalDb,
  userId: number,
  provider: IdentityProvider,
): Promise<UnlinkIdentityResult> {
  const identities = await getUserIdentities(db, userId); // oldest-first
  const target = identities.find((i) => i.provider === provider);
  if (!target) {
    return { ok: false, reason: 'NOT_LINKED' };
  }

  const remaining = identities.filter((i) => i.id !== target.id);
  const user = await getUserById(db, userId);
  const hasLocalPassword = !!user?.passwordHash;

  if (remaining.length === 0 && !hasLocalPassword) {
    return { ok: false, reason: 'LAST_IDENTITY' };
  }

  await deleteIdentity(db, userId, provider);

  let rederived = false;
  if (user && user.canonicalEmailSource === provider) {
    // remaining is already oldest-first, so the first verified-email row is the
    // oldest verified identity.
    const next = remaining.find(
      (i) => i.providerEmail && i.providerEmailVerified,
    );
    if (next?.providerEmail) {
      await setCanonicalEmail(db, userId, next.providerEmail, next.provider);
      rederived = true;
    } else {
      // No remaining identity has a verified email to anchor canonical on.
      // Leave users.canonical_email untouched (the account is still reachable
      // via the local password) and drop the source to the manual-override state.
      await setCanonicalEmailSource(db, userId, null);
    }
  }

  return { ok: true, rederived };
}

/** A single subscription row as stored in the internal schema. */
export type InternalSubscription = typeof Schema.subscriptions.$inferSelect;

/**
 * Fetch the subscription row for a user, or null if they have none.
 *
 * `userId` is indexed but not unique on the subscriptions table, so this
 * intentionally takes the first row (via LIMIT 1) rather than asserting
 * uniqueness — mirroring SubscriptionService.getSubscriptionByUserId.
 */
export async function getSubscriptionByUserId(
  db: InternalDb,
  userId: number,
): Promise<InternalSubscription | null> {
  const results = await db
    .select()
    .from(Schema.subscriptions)
    .where(() => eq(Schema.subscriptions.userId, userId))
    .limit(1);
  return results[0] ?? null;
}

/**
 * Sets avatarUrl for a user only if their current avatarUrl is null.
 * Safe to call unconditionally — it is a no-op when avatarUrl is already set.
 */
export async function setInitialAvatarUrl(
  db: InternalDb,
  userId: number,
  avatarUrl: string,
): Promise<void> {
  await db
    .update(Schema.usersInAppInternal)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(
      and(
        eq(Schema.usersInAppInternal.id, userId),
        isNull(Schema.usersInAppInternal.avatarUrl),
      ),
    );
}

/**
 * Stamp a user's `last_login_at` with the current time after a successful
 * login. Intentionally does NOT touch `updated_at` — a login is an
 * authentication event, not a profile mutation, so it should not move the
 * row's content-modification timestamp. (LS-6674 / LGN-019)
 */
export async function updateLastLoginAt(
  db: InternalDb,
  userId: number,
): Promise<void> {
  await db
    .update(Schema.usersInAppInternal)
    .set({ lastLoginAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId));
}

/** A user's multi-factor-auth state as stored in the internal schema. */
export interface UserMfaState {
  mfaEnabled: boolean;
  totpSecret: string | null;
}

/**
 * Read a user's MFA state (enrollment flag + TOTP secret), or null if the
 * user does not exist. Selects only the MFA columns rather than the full row
 * so the secret is never fetched alongside unrelated user data by accident.
 */
export async function getUserMfa(
  db: InternalDb,
  userId: number,
): Promise<UserMfaState | null> {
  return await db
    .select({
      mfaEnabled: Schema.usersInAppInternal.mfaEnabled,
      totpSecret: Schema.usersInAppInternal.totpSecret,
    })
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.id, userId))
    .then(TakeUniqueOrNull);
}

/**
 * Update a user's MFA state. Sets both the enrollment flag and the TOTP secret
 * (pass totpSecret: null to clear it when disabling MFA). Returns the updated
 * user row.
 */
export async function setUserMfa(
  db: InternalDb,
  userId: number,
  { mfaEnabled, totpSecret }: UserMfaState,
): Promise<InternalUser> {
  return await db
    .update(Schema.usersInAppInternal)
    .set({ mfaEnabled, totpSecret, updatedAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId))
    .returning()
    .then(TakeUniqueOrThrow);
}

/** A single password-reset token row as stored in the internal schema. */
export type InternalPasswordResetToken =
  typeof Schema.passwordResetTokens.$inferSelect;

/**
 * Overwrite a user's password hash. Used by the reset-password flow after a
 * valid, single-use reset token has been consumed.
 */
export async function updateUserPassword(
  db: InternalDb,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await db
    .update(Schema.usersInAppInternal)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId));
}

/**
 * Delete every existing reset token for a user. Called before issuing a new
 * token so that requesting a fresh reset invalidates any outstanding links.
 */
export async function deletePasswordResetTokensForUser(
  db: InternalDb,
  userId: number,
): Promise<void> {
  await db
    .delete(Schema.passwordResetTokens)
    .where(eq(Schema.passwordResetTokens.userId, userId));
}

/**
 * Persist a new reset token. `tokenHash` is the hex SHA-256 digest of the raw
 * token; the raw token is only ever sent in the email link and never stored.
 */
export async function createPasswordResetToken(
  db: InternalDb,
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<InternalPasswordResetToken> {
  return await db
    .insert(Schema.passwordResetTokens)
    .values({ userId, tokenHash, expiresAt })
    .returning()
    .then(TakeUniqueOrThrow);
}

/**
 * Atomically consume a reset token: mark it used and return the row, but only
 * when it is currently unused and unexpired. Returns null when the token does
 * not exist, was already used, or has expired — the single UPDATE makes the
 * check-and-consume race-free so a token can never be redeemed twice.
 */
export async function consumePasswordResetToken(
  db: InternalDb,
  tokenHash: string,
): Promise<InternalPasswordResetToken | null> {
  const now = new Date();
  return await db
    .update(Schema.passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(Schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(Schema.passwordResetTokens.usedAt),
        gt(Schema.passwordResetTokens.expiresAt, now),
      ),
    )
    .returning()
    .then(TakeUniqueOrNull);
}
