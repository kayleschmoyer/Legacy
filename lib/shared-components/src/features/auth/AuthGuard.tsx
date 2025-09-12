import React, { PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';
import { LoadingPanel } from '../../LoadingPanel';

export interface AuthGuardProps extends PropsWithChildren {
  /**
   * Component to show when user is not authenticated
   */
  fallback?: React.ComponentType<any>;
  /**
   * Component to show while checking authentication
   */
  loadingComponent?: React.ComponentType;
  /**
   * Called when login is successful
   */
  onLoginSuccess?: () => void;
  /**
   * Called when login fails
   */
  onLoginFailure?: (error: string) => void;
  /**
   * Whether to redirect to login screen automatically
   */
  redirectToLogin?: boolean;
}

function AuthGuard({ 
  children,
  fallback: FallbackComponent = LoginScreen,
  loadingComponent: LoadingComponent = LoadingPanel,
  onLoginSuccess,
  onLoginFailure,
  redirectToLogin = true,
 }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingComponent />;
  }

  if (!isAuthenticated) {
    if (!redirectToLogin) {
      return <></>;
    }

    return (
      <FallbackComponent
        onLoginSuccess={onLoginSuccess}
        onLoginFailure={onLoginFailure}
      />
    );
  }

  return <>{children}</>;
}

export { AuthGuard };
