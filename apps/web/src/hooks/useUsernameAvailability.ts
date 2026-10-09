import { useEffect, useState } from 'react';
import { useUsernameAvailableQuery } from '@legacy-sports/graphql';
import { validateUsername } from '@legacy-sports/utils';

export const USERNAME_AVAILABILITY_DEBOUNCE_MS = 400;

/**
 * - `idle`: nothing to check (not editing, invalid, or unchanged)
 * - `checking`: waiting out the debounce or on the network
 * - `available` / `taken`: the server's answer for the current input
 * - `unknown`: the check failed (e.g. rate limited); Save still validates
 */
export type UsernameAvailability =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'unknown';

/**
 * Debounced live uniqueness pre-check for the username editor (LS-7241).
 * Advisory only — `updateUsername` still enforces uniqueness on save.
 */
export function useUsernameAvailability(
  candidate: string,
  currentUsername: string,
  enabled: boolean,
): UsernameAvailability {
  const validation = validateUsername(candidate);
  const trimmed = validation.valid ? validation.username : null;
  const shouldCheck =
    enabled && trimmed !== null && trimmed !== currentUsername;

  const [debounced, setDebounced] = useState<string | null>(null);
  useEffect(() => {
    if (!shouldCheck) {
      setDebounced(null);
      return;
    }
    const timer = setTimeout(
      () => setDebounced(trimmed),
      USERNAME_AVAILABILITY_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [shouldCheck, trimmed]);

  const settled = shouldCheck && debounced === trimmed;
  const { data, loading, error } = useUsernameAvailableQuery({
    variables: { username: debounced ?? '' },
    skip: !settled,
    // A name can be claimed between keystrokes; never serve a cached answer.
    fetchPolicy: 'network-only',
  });

  if (!shouldCheck) return 'idle';
  if (!settled || loading) return 'checking';
  if (error || data?.usernameAvailable == null) return 'unknown';
  return data.usernameAvailable ? 'available' : 'taken';
}
