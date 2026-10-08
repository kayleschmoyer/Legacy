/**
 * Canonical public origin of the web app (LS-10765).
 *
 * Single source for absolute URLs that must work without JS — the static
 * og:url / og:image / twitter:image tags in index.html (injected at build
 * time as %VITE_SITE_URL% by vite.config.mts) and PageMeta's no-window
 * fallback. Must match the CNAME written by .github/workflows/deploy-web.yml.
 */
export const SITE_URL = 'https://legacy-fantasy.com';
