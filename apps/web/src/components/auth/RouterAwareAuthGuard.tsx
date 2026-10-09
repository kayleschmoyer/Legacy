import React from 'react';
import { useLocation } from 'react-router-dom';
import { EnhancedAuthGuard } from '@legacy-sports/shared-components/auth';
import type { EnhancedAuthGuardProps } from '@legacy-sports/shared-components/auth';

export interface RouterAwareAuthGuardProps extends Omit<
  EnhancedAuthGuardProps,
  'currentPath'
> {
  /** Router basename (no trailing slash) that `publicPaths` entries include. */
  basePath: string;
}

/**
 * EnhancedAuthGuard fed from the router location (LS-10488). Must render
 * inside a Router. Reading window.location.pathname only re-rendered the guard
 * when auth state changed, so a signed-out visitor navigating client-side from
 * a public path (/pricing) to a protected one skipped the login/loading gate.
 * useLocation() strips the router basename, so it is re-prefixed to match the
 * basename-prefixed `publicPaths` entries.
 */
export function RouterAwareAuthGuard({
  basePath,
  ...guardProps
}: RouterAwareAuthGuardProps): React.JSX.Element {
  const { pathname } = useLocation();
  return (
    <EnhancedAuthGuard {...guardProps} currentPath={`${basePath}${pathname}`} />
  );
}
