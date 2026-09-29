import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Trailing-edge debounce that merges every queued patch into one `save` call
 * (LS-7081). Rapid toggles / stepper clicks collapse into a single write of
 * the final values. A pending patch is flushed on unmount so an edit made just
 * before navigating away is not lost.
 */
export function useCoalescedSave<T extends object>(
  save: (patch: T) => void,
  delayMs: number,
): { queue: (patch: T) => void; hasPending: () => boolean } {
  const pendingRef = useRef<Partial<T>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    saveRef.current(patch as T);
  }, []);

  const queue = useCallback(
    (patch: T) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  const hasPending = useCallback(
    () => Object.keys(pendingRef.current).length > 0,
    [],
  );

  useEffect(() => flush, [flush]);

  return useMemo(() => ({ queue, hasPending }), [queue, hasPending]);
}
