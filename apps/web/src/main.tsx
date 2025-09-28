import { StrictMode } from 'react';
import { HashRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';

// Initialize React Native Web
import 'react-native-web/dist/cjs/exports/AppRegistry';

import { AppProvider, AuthProvider } from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { env } from './config/environment';
import { apolloClient } from './lib/apollo-client';
import App from './app/app';

// Alternative: import AppWithAuth from './app/app-with-auth'; // Uses EnhancedAuthGuard for simpler setup

// Create secure OAuth configuration (single-lambda architecture)
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <HashRouter>
      <AuthProvider config={authConfig}>
        <AppProvider
          apolloClient={apolloClient}
          colorScheme="dark"
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          tamaguiConfig={tamaguiConfig}
        >
          <App />
          {/* Alternative: <AppWithAuth /> - Uses EnhancedAuthGuard approach */}
        </AppProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
