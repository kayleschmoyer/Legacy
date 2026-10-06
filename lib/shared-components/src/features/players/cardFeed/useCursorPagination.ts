/**
 * Cursor-continuation pagination for the career-stats connection queries
 * (`careerBattingStats` / `footballPlayers`) — accumulates pages onto a
 * growing list for infinite-scroll-style consumers, while resetting to a
 * fresh page whenever the query's filter/sort key changes.
 *
 * Extracted from the native card feed screen (LS-8832,
 * `apps/app/src/app/(app)/(tabs)/(players)/players.tsx`) so the web card presentation
 * (LS-9073, `PlayersGrid`'s cards view) can share the identical pagination
 * model instead of re-deriving it — the ticket's "keep cursor paging
 * underneath" direction for reconciling the card feed's infinite scroll with
 * the stats table's page-size selector.
 *
 * Split into two hooks because of a dependency order constraint: `cursor`
 * must exist *before* the GraphQL hook runs (it's the `after` variable), but
 * the accumulated list can only be derived *after* the GraphQL hook returns
 * `data` — so a single combined hook can't own both ends. `isResetRef`
 * bridges the two: the cursor hook flags a reset when `queryKey` changes
 * (e.g. position/search/sort — an unrelated query, not the next page), and
 * the accumulation hook consumes that flag to replace the list instead of
 * appending to it — and, while the reset query is still loading, to clear
 * the list so the previous query's rows never linger on screen.
 */

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

export function useResettableCursor(queryKey: string): {
  cursor: string | undefined;
  setCursor: (cursor: string | undefined) => void;
  isResetRef: MutableRefObject<boolean>;
} {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const prevKeyRef = useRef(queryKey);
  const isResetRef = useRef(true);

  useEffect(() => {
    if (prevKeyRef.current !== queryKey) {
      prevKeyRef.current = queryKey;
      isResetRef.current = true;
      setCursor(undefined);
    }
  }, [queryKey]);

  return { cursor, setCursor, isResetRef };
}

export function useAccumulatedPages<T>(
  data: readonly T[],
  loading: boolean,
  cursor: string | undefined,
  isResetRef: MutableRefObject<boolean>,
): readonly T[] {
  const [accumulated, setAccumulated] = useState<readonly T[]>([]);
  const prevCursorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (loading) {
      // A pending reset means the in-flight request is for a *different*
      // query (new position/search/sort), so the rows on screen no longer
      // answer it. Drop them so consumers fall back to their initial-loading
      // state instead of rendering stale rows next to the new query's count
      // (LS-10435/LS-10438). A plain next-page load (no reset) keeps the
      // accumulated rows visible underneath the "loading more" indicator.
      if (isResetRef.current) {
        setAccumulated((prev) => (prev.length === 0 ? prev : []));
      }
      return;
    }
    if (isResetRef.current) {
      setAccumulated(data);
      isResetRef.current = false;
    } else if (prevCursorRef.current !== cursor) {
      setAccumulated((prev) => [...prev, ...data]);
    }
    prevCursorRef.current = cursor;
  }, [data, loading, cursor, isResetRef]);

  return accumulated;
}
