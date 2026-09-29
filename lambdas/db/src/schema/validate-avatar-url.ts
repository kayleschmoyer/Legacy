import { validateBrandingUrl } from './teams/validate-branding-url';
import { UserInputError } from './graphql-errors';

// Hosts (and their subdomains) permitted for user avatar URLs. The client's
// presets resolve to `window.location.origin`, so every deployed web origin
// (legacy-fantasy.com, www./app./dev. subdomains) must be covered. PRS-007:
// without this allowlist, updateUserAvatar persisted any URL, which is then
// fetched by every viewer in chat and league views (tracking pixels).
// Extra hosts (e.g. an upload CDN, localhost in dev) can be added through the
// comma-separated AVATAR_URL_ALLOWED_HOSTS env var.
const DEFAULT_ALLOWED_AVATAR_HOSTS = ['legacy-fantasy.com'] as const;

function allowedAvatarHosts(): string[] {
  const extra = (process.env['AVATAR_URL_ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return [...DEFAULT_ALLOWED_AVATAR_HOSTS, ...extra];
}

/**
 * Validate a user avatar URL: HTTPS, no credentials, public host (shared with
 * branding URL validation), and host on the avatar allowlist.
 *
 * `null` / `undefined` / blank means "clear the avatar" and returns `null`.
 * Throws `UserInputError` so the reason survives Apollo error masking.
 */
export function validateAvatarUrl(
  raw: string | null | undefined,
): string | null {
  const validated = validateBrandingUrl(raw ?? null, 'avatarUrl');
  if (validated === undefined || validated === null) return null;

  const hostname = new URL(validated).hostname.toLowerCase();
  const allowed = allowedAvatarHosts().some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (!allowed) {
    throw UserInputError('avatarUrl host is not allowed');
  }
  return validated;
}
