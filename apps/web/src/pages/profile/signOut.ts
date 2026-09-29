import { LOGGER } from '@legacy-sports/logging';

interface SignOutAuth {
  logout?: () => Promise<void>;
}

/**
 * Runs the auth context's logout handler, surfacing a missing or failing
 * handler through LOGGER instead of silently doing nothing.
 */
export function signOut(auth: SignOutAuth): void {
  if (typeof auth.logout !== 'function') {
    LOGGER.error('Sign out failed: auth.logout is not available');
    return;
  }
  try {
    auth.logout().catch((error: Error) => {
      LOGGER.error('Sign out failed:', error);
    });
  } catch (error) {
    LOGGER.error('Sign out failed:', error as Error);
  }
}
