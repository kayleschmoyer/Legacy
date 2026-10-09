// Hosts (and their subdomains) the web app will fetch avatar images from.
// Mirrors the server allowlist in lambdas/db validate-avatar-url.ts, plus
// Google's profile-photo CDN used for Google sign-in pictures. LS-7209: an
// untrusted host in an avatar URL turns the <img> into a tracking pixel even
// with referrerPolicy="no-referrer", so such URLs are never rendered.
const TRUSTED_AVATAR_HOSTS = ['legacy-fantasy.com', 'googleusercontent.com'];

export function isTrustedAvatarUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (typeof window !== 'undefined' && url.origin === window.location.origin) {
    return true;
  }
  if (url.protocol !== 'https:') return false;
  const hostname = url.hostname.toLowerCase();
  return TRUSTED_AVATAR_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}
