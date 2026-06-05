/**
 * Redirect-safety allowlist for post-login navigation.
 *
 * The Discord OAuth success handler redirects the browser to `env.baseUrl`
 * (Vite's build-time `BASE_URL`, normally a same-origin base path such as `/`
 * or a `/pr-preview/<id>/` path for preview deploys). That value is inlined at
 * build time and is not runtime user-controlled, but as defense-in-depth we
 * never feed an unvalidated string straight to `window.location.replace`.
 *
 * `getSafeRedirectTarget` resolves an arbitrary target against the current
 * origin and only returns it when it points at a trusted destination:
 *   - a same-origin location (returned as a path-only relative target), or
 *   - an absolute URL whose host is allowlisted (`legacy-fantasy.com` or one of
 *     its subdomains).
 * Anything else — cross-origin hosts, protocol-relative `//evil.com`,
 * backslash tricks, `javascript:`/`data:` schemes — falls back to the app root.
 * Using the WHATWG `URL` parser for resolution means these bypass attempts are
 * normalized to their real origin before the allowlist check runs.
 */

/** App root, used as the safe fallback when a target cannot be trusted. */
const APP_ROOT = '/';

/** Hosts (and their subdomains) permitted as absolute redirect targets. */
const ALLOWED_REDIRECT_HOSTS = ['legacy-fantasy.com'] as const;

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_REDIRECT_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * Resolve `rawTarget` to a safe navigation target, falling back to the app root
 * for anything that does not resolve to a trusted destination.
 *
 * @param rawTarget The candidate redirect target (e.g. `env.baseUrl`).
 * @param origin    The origin to resolve relative targets against. Defaults to
 *                  the current document origin; injectable for tests.
 */
export function getSafeRedirectTarget(
  rawTarget: string | null | undefined,
  origin: string = window.location.origin,
): string {
  if (!rawTarget) return APP_ROOT;

  let resolved: URL;
  let current: URL;
  try {
    // Resolve against the current origin so relative paths, protocol-relative
    // ("//evil.com"), and absolute URLs all expose their real destination.
    resolved = new URL(rawTarget, origin);
    current = new URL(origin);
  } catch {
    return APP_ROOT;
  }

  // Only http(s) targets are ever acceptable (blocks javascript:, data:, etc.).
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return APP_ROOT;
  }

  // Same-origin: keep navigation internal by returning a path-only target.
  if (resolved.origin === current.origin) {
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }

  // Cross-origin: only explicitly allowlisted hosts are permitted.
  if (isAllowedHost(resolved.hostname)) {
    return resolved.href;
  }

  return APP_ROOT;
}
