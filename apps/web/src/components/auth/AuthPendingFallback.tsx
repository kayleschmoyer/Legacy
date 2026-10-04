import React from 'react';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components/ui';
import { LoginPage } from '../../pages/login/LoginPage';

/**
 * What an authenticated page renders when `useAuth().user` is not available
 * yet — instead of `return null`, which leaves a blank page behind the nav
 * (LS-10457).
 *
 * The root `EnhancedAuthGuard` sits above the router and only re-reads the
 * pathname when auth state changes, so a client-side navigation from a public
 * path (e.g. /help) can mount an authenticated page with no user. While auth
 * is resolving this shows the standard loading panel; once it has resolved
 * with no user it renders the login screen in place, matching the guard: the
 * URL is kept, so signing in lands back on the same page (and the
 * session-expired notice from LS-10447 shows if the session just ended).
 */
export function AuthPendingFallback(): React.JSX.Element {
  const { isLoading } = useAuth();
  if (isLoading) return <UnifiedLoadingPanel fullScreen />;
  return <LoginPage />;
}
