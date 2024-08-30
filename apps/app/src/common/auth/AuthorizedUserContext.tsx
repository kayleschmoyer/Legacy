import { createContext, PropsWithChildren, useContext } from 'react';
import { Text } from 'react-native';
import { Redirect } from 'expo-router';
import { CurrentUserInfo, useCurrentUserInfo } from './AuthHooks';
import { LoadingPanel } from '../components/LoadingPanel';

export const AUTHORIZED_CONTEXT = createContext<null | CurrentUserInfo>(null);

export function AuthorizedUserContextProvider({
  children,
}: PropsWithChildren): JSX.Element {
  const { loading, data: currentInfo } = useCurrentUserInfo();

  if (loading) {
    return <LoadingPanel />;
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

export function useAuthorizedUserInfo(): CurrentUserInfo {
  const value = useContext(AUTHORIZED_CONTEXT);

  if (value === null) {
    throw new Error(
      'This component must be rendered inside an AuthorizedUserContextProvider',
    );
  }

  return value;
}
