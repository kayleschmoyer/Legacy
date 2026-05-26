const REDACTED = '[REDACTED]';

// JWT: three base64url segments, first starting with eyJ (base64 of '{"')
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

// Bearer / token header values
const BEARER_RE = /Bearer\s+\S+/gi;

// Standard email addresses
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Long runs of hex chars (≥32) that contain at least one digit — session tokens,
// UUIDs without dashes, etc. Requiring a digit (via lookahead) avoids false-positive
// matches on all-letter words or test strings composed solely of a-f/A-F characters.
const HEX_BLOB_RE = /\b(?=[0-9a-fA-F]{32,}\b)(?=\S*[0-9])[0-9a-fA-F]{32,}\b/g;

// JSON-like key/value pairs whose key name indicates a credential or PII field.
// Matches string, number, boolean, and null values so that e.g. {"token": 123} is also redacted.
const JSON_SENSITIVE_RE =
  /"(?:password|token|secret|authorization|auth|api_key|apikey|access_token|refresh_token|id_token|jwt|session)"\s*:\s*(?:"[^"]*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/gi;

export function scrubPii(text: string): string {
  return text
    .replace(JWT_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(HEX_BLOB_RE, REDACTED)
    .replace(JSON_SENSITIVE_RE, (match) => {
      const colonIdx = match.indexOf(':');
      return `${match.slice(0, colonIdx + 1)} "${REDACTED}"`;
    });
}

/**
 * Return only the path component of a URL, dropping query string, fragment,
 * and auth info. Relative URLs (no scheme) are preserved as-is up to the
 * first `?` or `#`.
 */
export function scrubUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'https://placeholder.invalid');
    // If the URL had a real host (absolute), include it; for relative paths return just the path.
    const hadScheme = /^https?:\/\//i.test(rawUrl);
    return hadScheme ? `${url.origin}${url.pathname}` : url.pathname;
  } catch {
    return rawUrl.split(/[?#]/)[0] ?? rawUrl;
  }
}
