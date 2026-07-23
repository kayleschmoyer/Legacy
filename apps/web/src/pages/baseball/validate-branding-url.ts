// Mirrors the server-side validation in
// lambdas/db/src/schema/teams/validate-branding-url.ts so a URL that passes
// here never fails the `updateTeamBranding` mutation (LS-6043 — client used
// to only check `/^https:\/\//i`, which is far looser than the server's
// `new URL()` + protocol/credentials/SSRF checks).

const MAX_URL_LENGTH = 2048;

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
 * Validate a trimmed, non-empty team branding image URL.
 *
 * Returns an error message if invalid, or `null` if the URL is acceptable.
 */
export function validateBrandingUrl(
  url: string,
  fieldLabel: string,
): string | null {
  if (url.length > MAX_URL_LENGTH) {
    return `${fieldLabel} URL is too long (max 2048 characters)`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${fieldLabel} URL must be a valid URL`;
  }

  if (parsed.protocol !== 'https:') {
    return `${fieldLabel} URL must use HTTPS`;
  }

  if (parsed.username || parsed.password) {
    return `${fieldLabel} URL must not contain credentials`;
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return `${fieldLabel} URL must be a public URL`;
    }
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return `${fieldLabel} URL must use a domain name, not an IP address`;
  }

  return null;
}
