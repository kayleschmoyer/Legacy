import { UserInputError } from './graphql-errors';

const MAX_URL_LENGTH = 2048;

// Domains (and their subdomains) permitted for chat GIF URLs. Giphy's CDN
// serves images from subdomains like media0.giphy.com / i.giphy.com; Tenor's
// from media.tenor.com. FLD-047: without this allowlist, sendLeagueMessage
// persisted and broadcast an arbitrary gifUrl to every league member's
// client, which rendered it unsanitized (tracking pixels / NSFW content).
const ALLOWED_GIF_HOSTS = ['giphy.com', 'tenor.com'] as const;

function isAllowedGifHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_GIF_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * Validate a chat GIF URL against the giphy.com / tenor.com allowlist.
 *
 * `undefined` / `null` (or an all-whitespace string) means "no GIF attached"
 * and passes through as `null`. Throws `UserInputError` (client-facing)
 * rather than a bare `Error` so the reason survives Apollo's `formatError`
 * masking instead of reaching the client as a generic "Internal server
 * error".
 */
export function validateGifUrl(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null || raw.trim() === '') return null;
  const trimmed = raw.trim();

  if (trimmed.length > MAX_URL_LENGTH) {
    throw UserInputError(`gifUrl is too long (max ${MAX_URL_LENGTH} chars)`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw UserInputError('gifUrl must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw UserInputError('gifUrl must use HTTPS');
  }

  if (parsed.username || parsed.password) {
    throw UserInputError('gifUrl must not contain credentials');
  }

  if (!isAllowedGifHost(parsed.hostname)) {
    throw UserInputError('gifUrl must be hosted on giphy.com or tenor.com');
  }

  return trimmed;
}
