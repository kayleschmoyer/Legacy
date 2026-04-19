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
