import { LOGGER } from '@legacy-sports/logging';
import {
  InternalDb,
  linkIdentity,
  unlinkIdentity,
} from '@legacy-sports/db-client';
import { OAuthProvider } from './resolveOrCreateUser';

/**
 * Provider-agnostic link/unlink core, generalizing the Discord-only
 * `handleDiscordLink` / `handleDiscordUnlink` persistence onto the shared
 * `user_identities` table. Each provider's HTTP handler verifies its own token
 * (and CSRF / OAuth state), extracts the identity tuple, then delegates the
 * actual link rules and writes here.
 */

/** Identity tuple a verified provider token resolves to. */
export interface ProviderIdentity {
  provider: OAuthProvider;
  providerAccountId: string;
  providerEmail: string | null;
  emailVerified: boolean;
  providerUsername?: string | null;
  providerAvatar?: string | null;
}

/** Outcome of a link/unlink, mapped to an HTTP status + message by the caller. */
export type IdentityMutationResult =
  | { ok: true }
  | { ok: false; statusCode: number; message: string };

/**
 * Link a verified provider identity onto the authenticated user.
 *
 * Enforces the two link rules via {@link linkIdentity}:
 * - provider account already linked to another user → 409
 * - user already has that provider linked → 409
 */
export async function linkProviderIdentity(
  db: InternalDb,
  userId: number,
  identity: ProviderIdentity,
): Promise<IdentityMutationResult> {
  const result = await linkIdentity(db, {
    userId,
    provider: identity.provider,
    providerAccountId: identity.providerAccountId,
    providerEmail: identity.providerEmail,
    providerEmailVerified: identity.emailVerified,
    providerUsername: identity.providerUsername,
    providerAvatar: identity.providerAvatar,
  });

  if (!result.ok) {
    if (result.reason === 'PROVIDER_ACCOUNT_TAKEN') {
      LOGGER.warn('Identity link blocked: account already linked to a user', {
        provider: identity.provider,
        userId,
      });
      // Generic message — do not confirm which account holds the link, so a
      // logged-in caller cannot enumerate other users' provider accounts.
      return {
        ok: false,
        statusCode: 409,
        message: `Could not link ${identity.provider} account`,
      };
    }
    return {
      ok: false,
      statusCode: 409,
      message: `A different ${identity.provider} account is already linked — unlink it first`,
    };
  }

  LOGGER.info('Identity linked', { provider: identity.provider, userId });
  return { ok: true };
}

/**
 * Unlink a provider identity from the authenticated user.
 *
 * Enforces the reachability guard (refuse to remove the last identity unless a
 * local password remains) and re-derives the canonical email when the unlinked
 * identity was its source, both via {@link unlinkIdentity}.
 */
export async function unlinkProviderIdentity(
  db: InternalDb,
  userId: number,
  provider: OAuthProvider,
): Promise<IdentityMutationResult> {
  const result = await unlinkIdentity(db, userId, provider);

  if (!result.ok) {
    if (result.reason === 'NOT_LINKED') {
      return {
        ok: false,
        statusCode: 400,
        message: `No ${provider} account linked`,
      };
    }
    return {
      ok: false,
      statusCode: 409,
      message:
        'Cannot unlink your only sign-in method — set a password or link another provider first',
    };
  }

  LOGGER.info('Identity unlinked', {
    provider,
    userId,
    rederived: result.rederived,
  });
  return { ok: true };
}
