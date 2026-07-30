import { useEffect, useState } from 'react';

/**
 * Debounce a changing value by `delayMs`. Same technique as the football
 * stats controller's internal `useDebounce` (footballStatsConfig.tsx) — a
 * cleanup-guarded `setTimeout` — kept as its own small hook here rather than
 * importing that one, since it is not exported from the controller module.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setDebounced(value);
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
