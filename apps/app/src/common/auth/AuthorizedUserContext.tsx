import { createContext, PropsWithChildren, useContext } from 'react';
import { Redirect } from 'expo-router';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';
import { LegacySportsJwt, useCurrentUserInfo } from './AuthHooks';

export const AUTHORIZED_CONTEXT = createContext<null | LegacySportsJwt>(null);

export function AuthorizedUserContextProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const { loading, data: currentInfo } = useCurrentUserInfo();

  if (loading) {
    return <UnifiedLoadingPanel />;
  }

  if (currentInfo === null) {
    return <Redirect href="/" />;
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
      'This component must be rendered inside an AuthorizedUserContextProvider',
    );
  }

  return value;
}
