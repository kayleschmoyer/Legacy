import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

// Initialize React Native Web
import 'react-native-web/dist/cjs/exports/AppRegistry';

// Import Tamagui CSS
import '@tamagui/core/reset.css';
import '@tamagui/font-inter/css/400.css';
import '@tamagui/font-inter/css/700.css';
import './styles.css';

import { AppProvider, AuthProvider, EnhancedAuthGuard } from '@legacy-sports/shared-components';
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { env } from './config/environment';
import { apolloClient } from './lib/apollo-client';
import { default as App } from './app/app';

// Create secure OAuth configuration (single-lambda architecture)
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

function AuthenticatedApp() {
  const initialColorScheme: 'light' | 'dark' =
    typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  return (
    <HashRouter>
      <AppProvider
        apolloClient={apolloClient}
        colorScheme={initialColorScheme}
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        tamaguiConfig={tamaguiConfig}
      >
        <App />
      </AppProvider>
    </HashRouter>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

console.log('Starting app with unified authentication flow...');
console.log('Environment config:', env);

try {
  root.render(
    <StrictMode>
      <TamaguiProvider
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config={tamaguiConfig}
      >
        <AuthProvider config={authConfig}>
          <EnhancedAuthGuard
            loginTitle="Welcome to Legacy Sports!"
            loginSubtitle="Sign in to access your fantasy leagues and stats"
            testMode={env.authTestMode}
            onLoginSuccess={() => {
              console.log('Web app login successful!');
            }}
            onLoginFailure={(error) => {
              console.error('Web app login failed:', error);
            }}
          >
            <AuthenticatedApp />
          </EnhancedAuthGuard>
        </AuthProvider>
      </TamaguiProvider>
    </StrictMode>,
  );
  console.log('App rendered successfully with unified auth!');
} catch (error) {
  console.error('Error rendering app:', error);
}
