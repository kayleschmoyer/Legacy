import { type ReactNode, StrictMode } from 'react';
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
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar/web';
import {
  AppProvider,
  ErrorBoundary,
} from '@legacy-sports/shared-components/ui';
import {
  AuthProvider,
  EnhancedAuthGuard,
} from '@legacy-sports/shared-components/auth';
import type { OAuthConfig } from '@legacy-sports/shared-components/auth';
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import { LOGGER } from '@legacy-sports/logging';
import { env } from './config/environment';
import { apolloClient } from './lib/apollo-client';
import { default as App } from './app/app';
import { store } from './store/store';
import { initializeAnalytics, trackLogin } from './utils/analytics';
import { ThemeProvider, useThemeContext } from './context/ThemeContext';
import { GrowthBookProvider } from './context/GrowthBookProvider';
import { PublicLandingPage } from './pages/landing/PublicLandingPage';

// Initialize Rollbar for web app
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Initialize Google Analytics
initializeAnalytics();

// Create secure OAuth configuration (single-lambda architecture)
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  discordClientId: env.discordClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

/** Strips any trailing slash from BASE_URL so path comparisons are consistent. */
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Inner component — reads the resolved theme from ThemeContext and passes it
 * to AppProvider so TamaguiProvider re-renders with the correct active theme
 * whenever the user changes their preference.
 */
function ThemeAwareApp() {
  const { resolvedTheme } = useThemeContext();

  return (
    <ReduxProvider store={store}>
      <BrowserRouter
        basename={basePath || '/'}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppProvider
          apolloClient={apolloClient}
          colorScheme={resolvedTheme}
          tamaguiConfig={tamaguiConfig}
        >
          <App />
        </AppProvider>
      </BrowserRouter>
    </ReduxProvider>
  );
}

/**
 * Reads the resolved theme from ThemeContext and passes it to the outer
 * TamaguiProvider as defaultTheme, so Tamagui components rendered during
 * the auth-guard loading phase match the user's actual theme preference
 * instead of always falling back to a hardcoded value.
 */
function ThemedTamaguiProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useThemeContext();
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedTheme}>
      {children}
    </TamaguiProvider>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

LOGGER.info('Starting app with unified authentication flow...');

try {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <ThemedTamaguiProvider>
            <AuthProvider
              config={authConfig}
              onUserSwitch={async () => {
                await apolloClient.resetStore();
              }}
            >
              <EnhancedAuthGuard
                loginTitle="Welcome to Legacy Sports!"
                loginSubtitle="Sign in to access your fantasy leagues and stats"
                loginComponent={<PublicLandingPage />}
                testMode={env.authTestMode}
                publicPaths={[
                  `${basePath}/about`,
                  // /pricing is publicly accessible so unauthenticated users can
                  // view plans and CTAs before signing up (LS-3557, LS-3561).
                  `${basePath}/pricing`,
                  // /faq redirects to /pricing (LS-3557, LS-3562). Adding it here
                  // ensures the client-side <Navigate> inside App fires for
                  // unauthenticated users — without it the auth guard intercepts
                  // before App renders.
                  `${basePath}/faq`,
                  // /players/stats shows public MLB player statistics — no
                  // auth required (LS-3548).
                  `${basePath}/players/stats`,
                  `${basePath}/scoreboard`,
                ]}
                onLoginSuccess={() => {
                  LOGGER.info('Web app login successful!');
                  trackLogin('google');
                }}
                onLoginFailure={(error: string) => {
                  LOGGER.error('Web app login failed:', error);
                }}
              >
                <GrowthBookProvider>
                  <ThemeAwareApp />
                </GrowthBookProvider>
              </EnhancedAuthGuard>
            </AuthProvider>
          </ThemedTamaguiProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  LOGGER.info('App rendered successfully with unified auth!');
} catch (error: unknown) {
  const err = error instanceof Error ? error : new Error(JSON.stringify(error));
  LOGGER.error('Error rendering app:', String(err));
  captureError(err, { context: 'web-app-render' });
}
