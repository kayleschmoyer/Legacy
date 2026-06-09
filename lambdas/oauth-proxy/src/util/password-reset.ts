import crypto from 'crypto';

/**
 * Password-reset token helpers (LS-6678 / LGN-023).
 *
 * A reset token has two forms:
 *  - the **raw token**, a high-entropy URL-safe string sent only in the email
 *    link and never persisted;
 *  - the **token hash**, the hex SHA-256 digest of the raw token, which is what
 *    we store in `app_internal.password_reset_tokens`.
 *
 * Storing only the hash means a database compromise yields no usable reset
 * links. Lookups hash the incoming raw token and compare against the stored
 * digest. The token itself is unguessable (256 bits of CSPRNG entropy), so the
 * hash-at-rest design provides the "signed, single-use, expiring" guarantees:
 * unforgeable (entropy + hash), single-use (`used_at`), expiring (`expires_at`).
 */

// 256 bits of entropy — far beyond brute-force reach within the token's TTL.
const TOKEN_BYTES = 32;

// Reset links expire one hour after issuance.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface GeneratedResetToken {
  /** Raw token to embed in the email link (never stored). */
  rawToken: string;
  /** Hex SHA-256 digest of the raw token (persisted). */
  tokenHash: string;
}

/** Hash a raw reset token to the form stored in the database. */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Generate a fresh raw token plus its stored hash. */
export function generateResetToken(): GeneratedResetToken {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { rawToken, tokenHash: hashResetToken(rawToken) };
}

/** Expiry timestamp for a token issued now. */
export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}
