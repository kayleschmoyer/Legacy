import { StrictMode } from 'react';
import { HashRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';

// Initialize React Native Web
import 'react-native-web/dist/cjs/exports/AppRegistry';

import {
  AppProvider,
  createAuthService,
  validateAuthConfig,
} from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { AuthConfig } from '@legacy-sports/shared-components';
import { apolloClient } from './lib/apollo-client';
import App from './app/app';

// Type assertions for platform-component magic string resolution
const typedValidateAuthConfig = validateAuthConfig as (
  config: AuthConfig,
) => void;
const typedCreateAuthService = createAuthService as (
  config: AuthConfig,
) => unknown;

// Create authentication configuration
const authConfig: AuthConfig = {
  oauthProxyUrl:
    (import.meta.env.VITE_OAUTH_PROXY_URL as string) || 'http://localhost:5001',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
};

// Validate the configuration
try {
  typedValidateAuthConfig(authConfig);
} catch (error) {
  console.warn('Auth configuration validation failed:', error);
  // In development, we can continue with default/test values
  if (import.meta.env.DEV) {
    console.log('Continuing with development/test configuration...');
  }
}

// Initialize authentication service
typedCreateAuthService(authConfig);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <HashRouter>
      <AppProvider
        apolloClient={apolloClient}
        colorScheme="dark"
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        tamaguiConfig={tamaguiConfig}
      >
        <App />
      </AppProvider>
    </HashRouter>
  </StrictMode>,
);
