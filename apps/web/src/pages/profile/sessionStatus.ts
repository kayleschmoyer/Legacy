export interface SessionStatus {
  state: 'active' | 'expired';
  label: 'Active' | 'Expired';
  /** e.g. "Expires in 42m"; null when the expiry is unknown or already past. */
  expiryHint: string | null;
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Derive the Session row state from the cached token expiry (seconds since
 * epoch, as stored by AuthService). A null expiry (e.g. impersonation, where
 * the JWT lives in an HttpOnly cookie) is reported as active with no hint.
 */
export function getSessionStatus(
  expirySeconds: number | null,
  nowMs: number,
): SessionStatus {
  if (expirySeconds === null || !Number.isFinite(expirySeconds)) {
    return { state: 'active', label: 'Active', expiryHint: null };
  }
  const remainingMs = expirySeconds * 1000 - nowMs;
  if (remainingMs <= 0) {
    return { state: 'expired', label: 'Expired', expiryHint: null };
  }
  return {
    state: 'active',
    label: 'Active',
    expiryHint: `Expires in ${formatRemaining(remainingMs)}`,
  };
}
