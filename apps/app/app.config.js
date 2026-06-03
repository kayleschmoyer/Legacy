// Expo dynamic config (LS-4777).
//
// Responsibilities:
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
//   2. Mirror APP_VERSION → EXPO_PUBLIC_APP_VERSION when only the bare name
//      is set (e.g. EAS / CI sets APP_VERSION; the EXPO_PUBLIC_ prefix is
//      required for babel-preset-expo to inline it).
//
// All other VITE_* → EXPO_PUBLIC_* aliasing (Rollbar, GrowthBook, Giphy,
// commit SHA, build date) is handled by the with-expo-public-env config
// plugin at prebuild (LS-7558, LS-7561). The legacy `resolvedExtra` URL
// routing (oauthProxy, googleClientId, graphqlHost) has been removed — those
// values are now read directly via static EXPO_PUBLIC_* member expressions in
// the @legacy-sports/app-config native adapter, which falls back to
// Constants.expoConfig.extra only for backward compat with old binaries
// (LS-7561).
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

// Mirror EXPO_PUBLIC_APP_VERSION from APP_VERSION when only the bare name is set.
if (
  !process.env.EXPO_PUBLIC_APP_VERSION?.trim() &&
  process.env.APP_VERSION?.trim()
) {
  process.env.EXPO_PUBLIC_APP_VERSION = process.env.APP_VERSION;
}

// Spread the static config from app.json. The `config` argument Expo passes
// here already includes the parsed app.json contents, but reading it
// explicitly makes the dependency obvious and survives future Expo CLI
// changes.
const staticConfig = require('./app.json').expo;

/** @type {(ctx: { config: import('@expo/config-types').ExpoConfig }) => import('@expo/config-types').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  ...staticConfig,
});
