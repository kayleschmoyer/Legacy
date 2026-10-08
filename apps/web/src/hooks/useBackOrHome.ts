import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Returns a "← Back" handler that stays inside the app (LS-10768).
 *
 * React Router keys the first history entry of a session `'default'` (no
 * router state yet — a fresh tab, an email link, or a full page load). Going
 * back from there would leave the SPA (about:blank in a new tab), so fall back
 * to `fallbackPath` instead. Any later entry was pushed in-app, so
 * `navigate(-1)` returns to the previous in-app page.
 */
export function useBackOrHome(fallbackPath = '/'): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();

  return useCallback(() => {
    if (key === 'default') {
      navigate(fallbackPath, { replace: true });
    } else {
      navigate(-1);
    }
  }, [key, navigate, fallbackPath]);
}
