import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider as ReduxProvider } from 'react-redux';

// React Native Web is initialized automatically via Vite plugin
// No explicit AppRegistry import needed

// Import Tamagui CSS
import '@tamagui/core/reset.css';
import '@tamagui/font-inter/css/400.css';
import '@tamagui/font-inter/css/700.css';
import './styles.css';

import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
} from '@legacy-sports/sentry/web';
import {
  AppProvider,
  AuthProvider,
  EnhancedAuthGuard,
  ErrorBoundary,
} from '@legacy-sports/shared-components';
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { env } from './config/environment';
import { apolloClient } from './lib/apollo-client';
import { default as App } from './app/app';
import { store } from './store/store';
import { initializeAnalytics, trackLogin } from './utils/analytics';

// Initialize Sentry for web app
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// Initialize Google Analytics
initializeAnalytics();

// Create secure OAuth configuration (single-lambda architecture)
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

function AuthenticatedApp() {
  const initialColorScheme: 'light' | 'dark' =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  return (
    <ReduxProvider store={store}>
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <AppProvider
          apolloClient={apolloClient}
          colorScheme={initialColorScheme}
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          tamaguiConfig={tamaguiConfig}
        >
          <App />
        </AppProvider>
      </BrowserRouter>
    </ReduxProvider>
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
      <ErrorBoundary reportError={captureError}>
        <TamaguiProvider
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config={tamaguiConfig}
        >
          <AuthProvider
            config={authConfig}
            onUserSwitch={async () => {
              await apolloClient.resetStore();
            }}
          >
            <EnhancedAuthGuard
              loginTitle="Welcome to Legacy Sports!"
              loginSubtitle="Sign in to access your fantasy leagues and stats"
              testMode={env.authTestMode}
              onLoginSuccess={() => {
                console.log('Web app login successful!');
                trackLogin('google');
              }}
              onLoginFailure={(error: string) => {
                console.error('Web app login failed:', error);
                captureError(new Error(error), { context: 'web-app-login' });
              }}
            >
              <AuthenticatedApp />
            </EnhancedAuthGuard>
          </AuthProvider>
        </TamaguiProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  console.log('App rendered successfully with unified auth!');
} catch (error: unknown) {
  const err = error instanceof Error ? error : new Error(JSON.stringify(error));
  console.error('Error rendering app:', err);
  captureError(err, { context: 'web-app-render' });
}
