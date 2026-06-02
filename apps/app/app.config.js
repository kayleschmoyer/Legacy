// Expo dynamic config (LS-4777).
//
// Two responsibilities:
//
//   1. Load the monorepo root `.env` so Expo and Metro can see the same
//      ROLLBAR / EXPO_PUBLIC_* variables that the web app, scripts, and
//      Terraform already consume. `expo start` runs with cwd=apps/app, so by
//      default Expo only reads apps/app/.env* — which means EXPO_PUBLIC_*
//      values set in root /.env never reach the device. Loading dotenv from
//      `../../.env` here runs before Metro starts and populates process.env
//      for the bundler, so EXPO_PUBLIC_* values are inlined into the JS
//      bundle at build time.
//
//   2. Alias the existing client token so we don't double-provision. The
//      web app uses VITE_ROLLBAR_ACCESS_TOKEN (post_client_item); the native
//      app uses the same token under EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN. One
//      Rollbar project, one client token — items remain separable in the
//      dashboard via the rollbar SDK's `client.javascript.platform` /
//      `platform` payload fields.
//
// Static fields (name, version, plugins, ios/android config) still live in
// app.json so the CI build-validation step (.github/actions/build-validation)
// can verify them with jq. Expo merges both at config-resolution time, with
// values returned from this function taking precedence.

const path = require('path');

// Load root .env first, then apps/app/.env / .env.local on top. `override: false`
// means values already in process.env (e.g. from the shell, CI, EAS secrets)
// win over .env file contents — standard 12-factor precedence.
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  override: false,
});
require('dotenv').config({
  path: path.resolve(__dirname, '.env.local'),
  override: false,
});
require('dotenv').config({
  path: path.resolve(__dirname, '.env'),
  override: false,
});

// Alias the existing web client token onto the EXPO_PUBLIC_ name Expo inlines.
// Only set when the EXPO_PUBLIC_ name is empty (or whitespace-only — a config
// typo like `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN= ` in a .env file would
// otherwise leave Rollbar silently uninitialized despite VITE_ROLLBAR_ACCESS_TOKEN
// being valid). An explicit override (EAS secret, CI env var, separate
// mobile-only token down the road) still wins.
if (
  !process.env.EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN?.trim() &&
  process.env.VITE_ROLLBAR_ACCESS_TOKEN?.trim()
) {
  process.env.EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN =
    process.env.VITE_ROLLBAR_ACCESS_TOKEN;
}

// Mirror EXPO_PUBLIC_APP_VERSION from APP_VERSION when only the bare name is set.
if (
  !process.env.EXPO_PUBLIC_APP_VERSION?.trim() &&
  process.env.APP_VERSION?.trim()
) {
  process.env.EXPO_PUBLIC_APP_VERSION = process.env.APP_VERSION;
}

// Mirror VITE_GROWTHBOOK_CLIENT_KEY → EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY so
// mobile uses the same GrowthBook project as web without a separate .env entry.
if (
  !process.env.EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY?.trim() &&
  process.env.VITE_GROWTHBOOK_CLIENT_KEY?.trim()
) {
  process.env.EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY =
    process.env.VITE_GROWTHBOOK_CLIENT_KEY;
}

// Spread the static config from app.json. The `config` argument Expo passes
// here already includes the parsed app.json contents, but reading it
// explicitly makes the dependency obvious and survives future Expo CLI
// changes.
const staticConfig = require('./app.json').expo;

// Return the env var only when it holds a non-whitespace value, so an unset or
// blank EXPO_PUBLIC_* falls back to the app.json placeholder instead of
// overwriting it with `undefined`.
const fromEnv = (name) => {
  const value = process.env[name];
  return value?.trim() ? value : undefined;
};

// Mirror runtime EXPO_PUBLIC_* URLs into `extra`.
//
// These values are read on-device through `@legacy-sports/env-utilities`
// (`getEnvVarOptional` / `getEnvVarRequired`), which does a *dynamic*
// `process.env[name]` lookup. `babel-preset-expo` only inlines *static*
// `process.env.EXPO_PUBLIC_*` member expressions, so the dynamic reads resolve
// to `undefined` in a release bundle — the env values loaded above never reach
// the device that way, and resolution falls back to the localhost placeholder.
// `extra`, by contrast, is embedded into the compiled manifest at prebuild time
// and read back via `Constants.expoConfig.extra`, so it is the only reliable
// channel for these URLs. The consumers (`mobileOAuthConfig` / `DbClient`)
// prefer the env var, then fall back to `extra`, so this keeps `expo start`
// working while fixing release builds (LS-6399).
const resolvedExtra = {
  ...staticConfig.extra,
  oauthProxyUrl:
    fromEnv('EXPO_PUBLIC_OAUTH_PROXY') ?? staticConfig.extra?.oauthProxyUrl,
  googleClientId:
    fromEnv('EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID') ??
    staticConfig.extra?.googleClientId,
  graphqlHost:
    fromEnv('EXPO_PUBLIC_GRAPHQL_HOST') ?? staticConfig.extra?.graphqlHost,
};

/** @type {(ctx: { config: import('@expo/config-types').ExpoConfig }) => import('@expo/config-types').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  ...staticConfig,
  extra: resolvedExtra,
});
