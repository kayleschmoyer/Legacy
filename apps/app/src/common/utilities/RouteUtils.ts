import type { ImperativeRouter } from 'expo-router';

/**
 * The Home tab's path. Every "go back to home" destination in the app resolves
 * here: `/` is only a redirect to it, and `/baseball` / `/football` are only
 * redirects into it (LS-8823).
 */
export const HOME_TAB_HREF = '/home';

/** The slice of the expo-router router that {@link closeToHomeTab} needs. */
type CloseNavigator = Pick<ImperativeRouter, 'back' | 'canGoBack' | 'navigate'>;

/**
 * Dismisses a pushed screen for a cancel/close action ("X", "Cancel",
 * "Discard").
 *
 * Pops back to whatever the user came from, so the tab bar stays visible and no
 * screen is added to the stack; falls back to the Home tab when there is
 * nothing to pop (a cold-start deep link straight into the screen).
 *
 * Cancel handlers must not navigate to a concrete home path instead. Pushing
 * `/baseball` or `/football` used to strand the user on a standalone copy of
 * the sport home outside the tab shell, which read as a second home page
 * (LS-8823); even `/home` would discard the surface the user actually came
 * from when the screen was opened from another tab.
 */
export function closeToHomeTab(router: CloseNavigator): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.navigate(HOME_TAB_HREF);
}

/**
 * Safely parses a route param (string | string[] | undefined | unknown) as a
 * positive integer ID. Returns null for missing, non-string, non-finite, or
 * array params (takes first element of arrays). Eliminates silent NaN
 * propagation into GraphQL variables when expo-router returns unexpected shapes.
 */
export const toIntId = (raw: unknown): number | null => {
  const s = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  if (typeof s !== 'string') return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

const SEARCH_PARAM_MAX_LENGTH = 64;

/**
 * Sanitize a URL search parameter value before forwarding to filters. Strips
 * control characters (U+0000–U+001F, U+007F–U+009F) and enforces a maximum
 * length. Mirrors the web wrapper's `sanitizeSearchParam` so iOS/Android and
 * web hydrate from a shared link identically.
 *
 * Lives here (rather than in PlayerStats.tsx, its original home) so screens
 * that only need this pure string utility — not the full PlayerStats screen
 * and its subscription/PremiumGate/GraphQL transitive graph — can import it
 * directly (LS-8832). PlayerStats.tsx re-exports it for its existing callers.
 */
export function sanitizeSearchParam(value: string | null): string | null {
  if (value === null) return null;
  let stripped = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x1f && (code < 0x7f || code > 0x9f)) {
      stripped += value[i];
    }
  }
  if (!stripped) return null;
  return stripped.slice(0, SEARCH_PARAM_MAX_LENGTH);
}

// GraphQL Int is a 32-bit signed integer — clamp id values to prevent query
// errors (mirrors the web wrapper's MAX_GRAPHQL_INT guard).
const MAX_GRAPHQL_INT = 2147483647;

// Literal tokens that a blind `String(id)` coercion produces for a
// missing/NaN id. They are never valid identifiers, so the guard rejects them
// rather than forwarding them as a brefId (PST-052 / LS-7125).
const INVALID_ID_TOKENS: ReadonlySet<string> = new Set([
  'undefined',
  'null',
  'nan',
]);

/**
 * Resolve a player id (`number | string`) into a validated route param for the
 * PlayerDetail screen. A blind `String(id)` coercion could forward the
 * literal `'undefined'`/`'NaN'` for a missing id and crash the detail screen
 * (PST-052). This guard mirrors the web wrapper's `PlayerDetailPage`
 * validation:
 *  - a positive integer id (number, or a strict `/^\d+$/` string) within the
 *    GraphQL Int range is returned in canonical string form;
 *  - a non-numeric, non-empty string is treated as a Baseball-Reference id
 *    (brefId), trimmed and lower-cased to match web's brefId normalization;
 *  - anything else (undefined, null, empty/whitespace, the `'undefined'`/
 *    `'null'`/`'NaN'` tokens, zero/negative, non-finite, or out-of-range)
 *    returns `null` so the caller can skip navigation.
 */
export function toPlayerDetailIdParam(
  id: number | string | null | undefined,
): string | null {
  // Numeric ids: accept finite positive integers within the GraphQL Int range.
  if (typeof id === 'number') {
    return Number.isSafeInteger(id) && id > 0 && id <= MAX_GRAPHQL_INT
      ? String(id)
      : null;
  }
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed === '') return null;
  if (INVALID_ID_TOKENS.has(trimmed.toLowerCase())) return null;
  // A strict integer string is a numeric id (mirrors web's `/^\d+$/` split);
  // range-check it the same way as a numeric id.
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return parsed > 0 && parsed <= MAX_GRAPHQL_INT ? String(parsed) : null;
  }
  // Non-numeric string → brefId. Normalize like web (trim + lower-case).
  return trimmed.toLowerCase();
}
