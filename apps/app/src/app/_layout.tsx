import * as React from 'react';
import { Slot } from 'expo-router';
import Toast from 'react-native-toast-message';

import { TamaguiProvider } from 'tamagui';

import { useColorScheme } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';


import { useFonts } from 'expo-font';
import { ApolloProvider } from '@apollo/client';
import {tamaguiConfig} from '../TamaguiConfig';
import { LoadingPanel } from '../common/components/LoadingPanel';
import { DbClientContext } from '../common/ApolloClientContext';
import { ConditionalProviders } from '../common/ConditionalProviders';
import { useCurrentUserInfo } from '../common/auth/AuthHooks';

function InnerLayout(): JSX.Element {
  const { loading } = useCurrentUserInfo();
  const [fontsLoaded] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  });

  if (loading || !fontsLoaded) {
    return <LoadingPanel />;
  }

  return (
    <Slot/>
  );
}

export default function Layout() {
  const colorScheme = useColorScheme();
  const client = React.useContext(DbClientContext);

  return (
    <TamaguiProvider
      defaultTheme={colorScheme || undefined}
      config={tamaguiConfig}
    >
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ConditionalProviders>
          <ApolloProvider client={client.apolloClient}>
            <Toast />
            <InnerLayout />
          </ApolloProvider>
        </ConditionalProviders>
      </ThemeProvider>
    </TamaguiProvider>
  );
}
