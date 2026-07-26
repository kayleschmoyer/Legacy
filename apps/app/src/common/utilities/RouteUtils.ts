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
