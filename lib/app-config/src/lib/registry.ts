/**
 * Central key registry for @legacy-sports/app-config.
 *
 * Rules enforced by registry.spec.ts and the client-safe guard:
 *   - clientSafe: true  → value may be inlined into web/mobile bundles (publicly visible).
 *   - clientSafe: false → server-only secret; web/mobile names are FORBIDDEN.
 *
 * Default for new keys must be clientSafe: false until a reviewer marks it safe.
 * v1 seeds only clientSafe: true URLs/tokens that are already world-readable once shipped.
 */
export const CONFIG_KEYS = {
  statsApiUrl: {
    clientSafe: true,
    web: 'VITE_STATS_API_URL',
    mobile: 'EXPO_PUBLIC_STATS_API_URL',
    required: false,
  },
  websocketUrl: {
    clientSafe: true,
    web: 'VITE_WEBSOCKET_URL',
    mobile: 'EXPO_PUBLIC_WEBSOCKET_URL',
    required: false,
  },
  rollbarToken: {
    clientSafe: true,
    web: 'VITE_ROLLBAR_ACCESS_TOKEN',
    mobile: 'EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN',
    node: 'ROLLBAR_ACCESS_TOKEN',
    required: false,
  },
  giphyApiKey: {
    clientSafe: true,
    web: 'VITE_GIPHY_API_KEY',
    mobile: 'EXPO_PUBLIC_GIPHY_API_KEY',
    required: false,
  },
  growthbookClientKey: {
    clientSafe: true,
    web: 'VITE_GROWTHBOOK_CLIENT_KEY',
    mobile: 'EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY',
    required: false,
  },
  oauthProxy: {
    clientSafe: true,
    web: 'VITE_OAUTH_PROXY_URL',
    mobile: 'EXPO_PUBLIC_OAUTH_PROXY',
    required: false,
  },
  graphqlHost: {
    clientSafe: true,
    web: 'VITE_GRAPHQL_HOST',
    mobile: 'EXPO_PUBLIC_GRAPHQL_HOST',
    required: false,
  },
  googleClientId: {
    clientSafe: true,
    web: 'VITE_GOOGLE_CLIENT_ID',
    mobile: 'EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID',
    node: 'CLIENT_ID',
    required: false,
  },
  appBaseUrl: {
    clientSafe: true,
    web: 'VITE_APP_BASE_URL',
    mobile: 'EXPO_PUBLIC_APP_BASE_URL',
    required: false,
  },
  // Web-only keys below — no mobile counterpart
  environmentName: {
    clientSafe: true,
    web: 'VITE_ENVIRONMENT_NAME',
    required: false,
  },
  authTestMode: {
    clientSafe: true,
    web: 'VITE_AUTH_TEST_MODE',
    required: false,
  },
  discordClientId: {
    clientSafe: true,
    web: 'VITE_DISCORD_CLIENT_ID',
    required: false,
  },
  // appVersion / commitSha / buildDate have mobile names so AboutScreen and
  // similar screens can read them via the native adapter instead of direct env.
  appVersion: {
    clientSafe: true,
    web: 'VITE_APP_VERSION',
    mobile: 'EXPO_PUBLIC_APP_VERSION',
    required: false,
  },
  commitSha: {
    clientSafe: true,
    web: 'VITE_COMMIT_SHA',
    mobile: 'EXPO_PUBLIC_COMMIT_SHA',
    required: false,
  },
  buildDate: {
    clientSafe: true,
    web: 'VITE_BUILD_DATE',
    mobile: 'EXPO_PUBLIC_BUILD_DATE',
    required: false,
  },
  branch: {
    clientSafe: true,
    web: 'VITE_BRANCH',
    required: false,
  },
  rollbarCaptureRate: {
    clientSafe: true,
    web: 'VITE_ROLLBAR_CAPTURE_RATE',
    required: false,
  },
  googleAnalyticsMeasurementId: {
    clientSafe: true,
    web: 'VITE_GA_MEASUREMENT_ID',
    required: false,
  },
  jiraProxyUrl: {
    clientSafe: true,
    web: 'VITE_JIRA_PROXY_URL',
    required: false,
  },
  stripeMonthlyPriceId: {
    clientSafe: true,
    web: 'VITE_STRIPE_MONTHLY_PRICE_ID',
    required: false,
  },
  stripeAnnualPriceId: {
    clientSafe: true,
    web: 'VITE_STRIPE_ANNUAL_PRICE_ID',
    required: false,
  },
  vapidPublicKey: {
    clientSafe: true,
    web: 'VITE_VAPID_PUBLIC_KEY',
    required: false,
  },
  imageUploadUrl: {
    clientSafe: true,
    web: 'VITE_IMAGE_UPLOAD_URL',
    required: false,
  },
  repoUrl: {
    clientSafe: true,
    web: 'VITE_REPO_URL',
    required: false,
  },
} as const;
