import React, { createContext, PropsWithChildren, useContext } from 'react';
import { LegacySportsJwt, useCurrentUserInfo } from './AuthHooks';
import { LoadingPanel } from '../../LoadingPanel';

export const AUTHORIZED_CONTEXT = createContext<null | LegacySportsJwt>(null);

export interface AuthorizedUserContextProviderProps extends PropsWithChildren {
  /**
   * Custom loading component to show while checking authentication
   */
  loadingComponent?: React.ComponentType;
  /**
   * Custom component to show when user is not authenticated
   */
  unauthenticatedComponent?: React.ComponentType;
  /**
   * Called when authentication check is complete
   */
  onAuthCheckComplete?: (isAuthenticated: boolean) => void;
}

export function AuthorizedUserContextProvider({
  children,
  loadingComponent: LoadingComponent = LoadingPanel,
  unauthenticatedComponent: UnauthenticatedComponent,
  onAuthCheckComplete,
}: AuthorizedUserContextProviderProps): JSX.Element {
  const { loading, data: currentInfo } = useCurrentUserInfo();

  React.useEffect(() => {
    if (!loading && onAuthCheckComplete) {
      onAuthCheckComplete(currentInfo !== null);
    }
  }, [loading, currentInfo, onAuthCheckComplete]);

  if (loading) {
    return <LoadingComponent />;
  }

  if (currentInfo === null) {
    if (UnauthenticatedComponent) {
      return <UnauthenticatedComponent />;
    }
    // If no unauthenticated component provided, just return null
    // The parent should handle the redirect logic
    return <></>;
  }

  return (
    <AUTHORIZED_CONTEXT.Provider value={currentInfo}>
      {children}
    </AUTHORIZED_CONTEXT.Provider>
  );
}

export function useAuthorizedUserInfo(): LegacySportsJwt {
  const value = useContext(AUTHORIZED_CONTEXT);

  if (value === null) {
    throw new Error(
      'This component must be rendered inside an AuthorizedUserContextProvider'
    );
  }

  return value;
}

/**
 * Hook to check if user is currently authenticated
 */
export function useIsAuthenticated(): boolean {
  const value = useContext(AUTHORIZED_CONTEXT);
  return value !== null;
}
