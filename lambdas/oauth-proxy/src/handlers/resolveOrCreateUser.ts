import { LOGGER } from '@legacy-sports/logging';
import {
  createIdentity,
  createUser,
  getIdentityByProviderAccount,
  getIdentityByUserProvider,
  getUserByCanonicalEmailOrIdentityEmail,
  getUserByEmail,
  getUserById,
  InternalDb,
  InternalUser,
  linkDiscordAccount,
  linkIdentity,
  setCanonicalEmail,
  touchIdentityOnLogin,
} from '@legacy-sports/db-client';

/**
 * The external OAuth providers that flow through the shared resolver. `local`
 * (password) accounts are created by the register handler, not here.
 */
export type OAuthProvider = 'discord' | 'google' | 'apple';

/** Provider-reported identity, normalized across Discord / Google / Apple. */
export interface ResolveOrCreateUserInput {
  provider: OAuthProvider;
  /** Stable provider subject id: Discord snowflake, Google/Apple `sub`. */
  providerAccountId: string;
  /** Email this provider reported (may be null for the rare no-email case). */
  providerEmail: string | null;
  /** Whether the provider asserts the email is verified. */
  emailVerified: boolean;
  /** Provider display metadata, persisted on the identity row. */
  meta?: {
    providerUsername?: string | null;
    providerAvatar?: string | null;
  };
}

/** How the user was resolved — useful for logging/metrics and tests. */
export type ResolveOutcome = 'returning_identity' | 'auto_linked' | 'new_user';

/**
 * Result of {@link resolveOrCreateUser}.
 * - `ok` — the user was resolved or created; `outcome` says how.
 * - `conflict` — a verified-email match landed on a credentialed/colliding
 *   account; the caller must return a 409 directing the user to sign in and
 *   link from settings (the LS-6695 takeover guard).
 */
export type ResolveOrCreateUserResult =
  | { status: 'ok'; user: InternalUser; outcome: ResolveOutcome }
  | { status: 'conflict' };

/**
 * Shared, provider-agnostic sign-in resolver for OAuth providers. Replaces the
 * per-provider, email-only lookups (`getOrCreateUser`, `getUserFromGoogleEmail`,
 * Discord's `getUserByDiscordId` + email fallback).
 *
 * Keyed on `(provider, providerAccountId)` with a guarded email-owner fallback,
 * exactly as `docs/architecture/multi-provider-identity.md` (Authentication
 * flow) specifies. In this phase the canonical email is still stored in
 * `users.email` (the rename to `users.canonical_email` is the later Phase 2
 * cutover), so "canonical email" below maps to `users.email`.
 */
export async function resolveOrCreateUser(
  db: InternalDb,
  input: ResolveOrCreateUserInput,
): Promise<ResolveOrCreateUserResult> {
  const { provider, providerAccountId, providerEmail, emailVerified } = input;

  // 1. Fast path: a returning user matched by their provider account id.
  const identity = await getIdentityByProviderAccount(
    db,
    provider,
    providerAccountId,
  );
  if (identity) {
    const existing = await getUserById(db, identity.userId);
    if (!existing) {
      // FK guarantees this should not happen; treat a dangling identity as a
      // hard error rather than silently creating a duplicate account.
      throw new Error(
        `user_identities row ${identity.id} references missing user ${identity.userId}`,
      );
    }

    await touchIdentityOnLogin(db, identity.id, {
      providerEmail,
      providerEmailVerified: emailVerified,
      providerUsername: input.meta?.providerUsername,
      providerAvatar: input.meta?.providerAvatar,
    });

    // No legacy discord_* dual-write here: a returning user already has those
    // columns populated (Phase 1 backfill or the link/create path below), and
    // refreshing them every sign-in would churn users.updated_at needlessly.
    const user = await applyCanonicalEmailRule(db, existing, input);
    return { status: 'ok', user, outcome: 'returning_identity' };
  }

  // 2. No identity row for this provider account — decide link vs. create.
  const emailOwner = providerEmail
    ? await getUserByCanonicalEmailOrIdentityEmail(db, providerEmail)
    : { user: null, ambiguous: false };

  if (emailOwner.ambiguous) {
    // Verified emails can belong to only one human; an ambiguous match means
    // legacy/unverified data. Fail closed rather than guess (LS-6695).
    LOGGER.warn('resolveOrCreateUser: ambiguous email owner — failing closed', {
      provider,
    });
    return { status: 'conflict' };
  }

  // 3. Email-owner branch: link onto the existing account, or block.
  if (emailOwner.user) {
    const owner = emailOwner.user;
    const ownerHasProvider = !!(await getIdentityByUserProvider(
      db,
      owner.id,
      provider,
    ));

    // The LS-6695 takeover guard: never auto-link onto a credentialed account,
    // an unverified provider email, or an account that already holds a
    // different identity for this provider.
    if (!emailVerified || owner.passwordHash || ownerHasProvider) {
      LOGGER.warn(
        'resolveOrCreateUser: blocked auto-link onto existing account',
        { provider, ownerId: owner.id },
      );
      return { status: 'conflict' };
    }

    // Safe backfill: a password-less account whose canonical/identity email
    // matches this provider's verified email and has no identity for this
    // provider yet — the returning historical email-only user.
    const linked = await linkIdentity(db, {
      userId: owner.id,
      provider,
      providerAccountId,
      providerEmail,
      providerEmailVerified: emailVerified,
      providerUsername: input.meta?.providerUsername,
      providerAvatar: input.meta?.providerAvatar,
    });
    if (!linked.ok) {
      // A concurrent link won the race; fail closed to avoid a partial state.
      LOGGER.warn('resolveOrCreateUser: auto-link race — failing closed', {
        provider,
        ownerId: owner.id,
        reason: linked.reason,
      });
      return { status: 'conflict' };
    }

    const user = await applyCanonicalEmailRule(db, owner, input);
    await syncDiscordLegacyColumns(db, user.id, input);
    return { status: 'ok', user, outcome: 'auto_linked' };
  }

  // 4. Brand-new user. The canonical email is the creating provider's email.
  if (!providerEmail) {
    // Callers (the sign-in handlers) reject no-email sign-ups before reaching
    // here; guard defensively since users.email is NOT NULL.
    throw new Error(
      `Cannot create a ${provider} user without a provider email`,
    );
  }

  const created = await createUser(db, providerEmail);
  const user = await setCanonicalEmail(db, created.id, providerEmail, provider);
  await createIdentity(db, {
    userId: user.id,
    provider,
    providerAccountId,
    providerEmail,
    providerEmailVerified: emailVerified,
    providerUsername: input.meta?.providerUsername,
    providerAvatar: input.meta?.providerAvatar,
  });
  await syncDiscordLegacyColumns(db, user.id, input);
  return { status: 'ok', user, outcome: 'new_user' };
}

/**
 * Canonical-email rule #3: when a provider reports a (verified) email that
 * differs from the stored one, refresh `users.email` **only if** the canonical
 * email currently tracks that same provider (`canonical_email_source`). This is
 * the explicit reversal of LS-6660's unconditional last-writer-wins overwrite —
 * a change from a non-source provider never rewrites the canonical email.
 *
 * Returns the (possibly updated) user row.
 */
async function applyCanonicalEmailRule(
  db: InternalDb,
  user: InternalUser,
  input: ResolveOrCreateUserInput,
): Promise<InternalUser> {
  const { provider, providerEmail, emailVerified } = input;

  if (!providerEmail || !emailVerified) return user;
  if (user.canonicalEmailSource !== provider) return user;
  if (user.email === providerEmail) return user;

  // Guard the unique constraint (users_email_uk): if another account already
  // owns the incoming email, keep the existing one rather than failing sign-in.
  // We never merge accounts here — that needs an explicit, authenticated step.
  const collision = await getUserByEmail(db, providerEmail);
  if (collision && collision.id !== user.id) {
    LOGGER.warn(
      'Canonical email refresh skipped: email already owned by another account',
      { userId: user.id, provider },
    );
    return user;
  }

  LOGGER.info('Refreshed canonical email from provider', {
    userId: user.id,
    provider,
  });
  return setCanonicalEmail(db, user.id, providerEmail, provider);
}

/**
 * Keep the legacy `users.discord_*` columns in sync with the Discord identity
 * row. The columns are still read by the GraphQL `User` type and the web
 * profile UI; this dual-write preserves those consumers until Phase 3 drops the
 * columns. No-op for non-Discord providers.
 */
async function syncDiscordLegacyColumns(
  db: InternalDb,
  userId: number,
  input: ResolveOrCreateUserInput,
): Promise<void> {
  if (input.provider !== 'discord') return;
  await linkDiscordAccount(
    db,
    userId,
    input.providerAccountId,
    input.meta?.providerUsername ?? '',
    input.meta?.providerAvatar ?? null,
  );
}
