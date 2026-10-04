import { useEffect } from 'react';

/**
 * Warns before the user leaves the page while `isDirty` is true (LS-7235).
 *
 * react-router-dom v6's `useBlocker` only works under a Data Router
 * (`createBrowserRouter` + `RouterProvider`). This app mounts a classic
 * `<BrowserRouter>` (see apps/web/src/main.tsx), so `useBlocker` throws "must
 * be used within a data router". We guard with window/document listeners
 * instead — the same pattern as LeagueCreatePage (LS-6109) and
 * EliteDraftBoardScreenWrapper (LS-4986):
 *
 * 1. `beforeunload` — refresh, tab close, typed-URL / external navigation.
 * 2. Capture-phase click on tabs/links — in-app route changes, before any
 *    `onClick` that calls `navigate()`.
 *
 * The browser back button is not intercepted: under `<BrowserRouter>` the
 * route has already changed by the time `popstate` fires.
 *
 * @param isDirty Whether there are unsaved edits worth protecting.
 * @param message Confirm text shown for in-app navigation.
 * @param ignoreRoot Optional element whose inner clicks are page interactions,
 *   not navigations away (e.g. the page's own tabs).
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  message: string,
  ignoreRoot?: Element | null,
): void {
  useEffect(() => {
    if (!isDirty) return;

    // `returnValue` is required for the browser prompt to appear at all; its
    // value is ignored.
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleNavClick = (event: MouseEvent) => {
      // cmd/ctrl/shift-click opens a new tab and keeps this page's state.
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (ignoreRoot?.contains(target)) return;

      const navTarget = target.closest('[role="tab"], a[href]');
      if (!navTarget) return;

      // Re-selecting the current tab is a no-op route-wise.
      if (navTarget.getAttribute('aria-selected') === 'true') return;

      // External / new-window links bypass the SPA — beforeunload covers them.
      if (navTarget instanceof HTMLAnchorElement) {
        if (navTarget.target === '_blank') return;
        const href = navTarget.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('?')) return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', handleNavClick, { capture: true });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleNavClick, { capture: true });
    };
  }, [isDirty, message, ignoreRoot]);
}
