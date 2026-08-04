import React from 'react';

/**
 * Tracks the `(prefers-reduced-motion: reduce)` media query on web. Always
 * `false` on native (and during SSR) — there is no DOM `window` to query.
 *
 * Consumers use this to collapse spring/timing animations (Dialog, Sheet,
 * etc.) to a near-instant duration so users who request reduced motion get
 * one, and so Playwright's `contextOptions: { reducedMotion: 'reduce' }`
 * (set repo-wide for E2E) makes dialog enter/exit settle deterministically
 * fast instead of riding out a full spring — this is what keeps WebKit's
 * spring-to-CSS timing variance from blowing past assertion timeouts
 * (LS-8995).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
