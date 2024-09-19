import * as React from 'react';
import { Slot } from 'expo-router';
import Toast from 'react-native-toast-message';
import { ApplicationProvider } from '@ui-kitten/components';
import * as eva from '@eva-design/eva';
import { ApolloProvider } from '@apollo/client';
import { useColorScheme } from 'react-native';
import { LoadingPanel } from '../common/components/LoadingPanel';
import { DbClientContext } from '../common/ApolloClientContext';
import { ConditionalProviders } from '../common/ConditionalProviders';
import { useCurrentUserInfo } from '../common/auth/AuthHooks';
import { DARK_THEME, LIGHT_THEME } from '../Theme';

function InnerLayout(): JSX.Element {
  const { loading } = useCurrentUserInfo();

  if (loading) {
    return <LoadingPanel />;
  }

  return <Slot />;
}

export default function Layout() {
  const client = React.useContext(DbClientContext);
  const color = useColorScheme();
  const theme = color === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <ApplicationProvider {...eva} theme={theme}>
      <ConditionalProviders>
        <ApolloProvider client={client.apolloClient}>
          <Toast />
          <InnerLayout />
        </ApolloProvider>
      </ConditionalProviders>
    </ApplicationProvider>
  );
}
