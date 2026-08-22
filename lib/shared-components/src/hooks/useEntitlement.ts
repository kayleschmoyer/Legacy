import { type EntitlementKey } from '@legacy-sports/utils';
import { useMyEntitlementsQuery } from '@legacy-sports/graphql';
import { useAuth } from '../features/auth';

/**
 * Returns the set of entitlement lookup_keys the current user's plan grants
 * (LS-8645), read from the server's `myEntitlements` resolver via
 * `@legacy-sports/graphql`.
 *
 * Canonical shared-components implementation (LS-6266 / FBH-012): any
 * premium gate for a shared component — e.g. a future live-scoring
 * sub-feature of the football matchup highlight card in `NFLHome` — must
 * check entitlements here, inside the shared component, rather than
 * resolving `isPremium` separately per platform (`apps/web`, `apps/app`) and
 * passing it down as a prop. That per-platform pattern is already
 * duplicated for `MLBHome.isPremium` / `FootballPlayerDetail.isPremium`;
 * this hook exists so the matchup highlight doesn't repeat it.
 */
export function useEntitlements(): {
  entitlements: EntitlementKey[];
  isLoading: boolean;
} {
  const { user, isLoading: authLoading } = useAuth();
  const { data, loading: queryLoading } = useMyEntitlementsQuery({
    skip: !user?.id,
  });

  return {
    entitlements: (data?.myEntitlements ?? []) as EntitlementKey[],
    isLoading: authLoading || queryLoading,
  };
}

/**
 * Returns whether the current user's plan grants a specific entitlement.
 * Returns `false` while the entitlement set is still loading, so a gate
 * never briefly unlocks premium content before status is confirmed.
 */
export function useHasEntitlement(key: EntitlementKey): boolean {
  const { entitlements, isLoading } = useEntitlements();
  if (isLoading) return false;
  return entitlements.includes(key);
}
