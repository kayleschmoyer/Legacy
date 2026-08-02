import type { ReactElement } from 'react';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

export type RefetchFn = () => Promise<unknown>;

/** Ready-made `<RefreshControl>` element, typed for `ScrollView`'s `refreshControl` prop. */
export type PullToRefreshControlElement = ReactElement<RefreshControlProps>;

export interface PullToRefreshResult {
  /** Whether a pull-triggered refresh is in flight. */
  refreshing: boolean;
  /** Pass to a `ScrollView`/`FlatList`'s `onRefresh` prop. */
  onRefresh: () => void;
  /** Ready-made element for a `ScrollView`'s `refreshControl` prop. */
  refreshControl: PullToRefreshControlElement;
}

/**
 * Owns the `refreshing` flag for a pull-to-refresh gesture backed by one or
 * more Apollo queries. Apollo's `loading` isn't a reliable refreshing source
 * once a screen is backed by several queries — it can go stale or never
 * settle for a given refetch, which is what makes a spinner stick. Instead
 * this hook drives its own boolean: set on pull, and always cleared once
 * every refetch has settled (success or failure) via `Promise.allSettled`,
 * so a failing query can't strand the spinner.
 */
export function usePullToRefresh(
  refetchFns: readonly RefetchFn[],
): PullToRefreshResult {
  const [refreshing, setRefreshing] = useState(false);

  // Latest refetch functions in a ref so `onRefresh` keeps a stable identity
  // even though callers typically pass a fresh array/closures every render.
  const refetchFnsRef = useRef(refetchFns);
  refetchFnsRef.current = refetchFns;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.allSettled(
      refetchFnsRef.current.map((refetch) => refetch()),
    ).finally(() => setRefreshing(false));
  }, []);

  return {
    refreshing,
    onRefresh,
    refreshControl: (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    ),
  };
}
