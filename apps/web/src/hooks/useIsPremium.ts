import { useAuth } from '@legacy-sports/shared-components';

/**
 * Returns whether the current user has premium access.
 *
 * TODO: Wire up actual subscription tier check once the premium subscription
 * system is implemented (accessLevel 'premium' or a dedicated subscription
 * field on the user). For now, admin users are treated as premium so the gate
 * can be validated end-to-end in development.
 */
export function useIsPremium(): boolean {
  const { user } = useAuth();
  return user?.accessLevel === 'admin';
}
