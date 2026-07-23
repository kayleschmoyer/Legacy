import { UserInputError } from '../graphql-errors';

const MAX_URL_LENGTH = 2048;

// Hostnames that resolve to private/loopback networks (SSRF prevention).
// These addresses are unreachable from end-user browsers and serve no
// purpose for image hosting.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // AWS instance metadata service
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fc[0-9a-f]{2}:/i, // IPv6 ULA
  /^\[?fe[89ab][0-9a-f]:/i, // IPv6 link-local
];

/**
 * Validate a team branding image URL (logo / avatar / banner).
 *
 * `undefined` means "field omitted, leave unchanged" and `null` means "field
 * explicitly cleared" — callers must check `=== undefined` before persisting
 * so an omitted field doesn't overwrite the stored value with `null`.
 *
 * Throws `UserInputError` (client-facing) rather than a bare `Error` so the
 * specific reason survives Apollo's `formatError` masking (LS-6043) instead
 * of reaching the client as a generic "Internal server error".
 */
export function validateBrandingUrl(
  raw: string | null | undefined,
  fieldName: string,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw.trim() === '') return null;
  const trimmed = raw.trim();

  if (trimmed.length > MAX_URL_LENGTH) {
    throw UserInputError(`${fieldName} URL is too long (max 2048 chars)`);
  }

  // Parse and validate as a proper URL (catches malformed inputs).
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw UserInputError(`${fieldName} must be a valid URL`);
  }

  // Only allow HTTPS — no http, data:, javascript:, etc.
  if (parsed.protocol !== 'https:') {
    throw UserInputError(`${fieldName} must use HTTPS`);
  }

  // Reject embedded credentials (user:pass@host) — phishing/confusion vector.
  if (parsed.username || parsed.password) {
    throw UserInputError(`${fieldName} must not contain credentials`);
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw UserInputError(`${fieldName} must be a public URL`);
    }
  }

  // Block bare IPv4 addresses (no legitimate image CDN uses a raw IP).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    throw UserInputError(
      `${fieldName} must use a domain name, not an IP address`,
    );
  }

  return trimmed;
}
