// Shared alias table derived from the CONFIG_KEYS registry
// (lib/app-config/src/lib/registry.ts).
//
// Each entry is [EXPO_PUBLIC_target, VITE_source]: the plugin copies the
// VITE_ value into the EXPO_PUBLIC_ slot when only the web name is set in the
// monorepo root .env.  Standard 12-factor precedence: if the EXPO_PUBLIC_ name
// is already set (non-empty) the alias is skipped so EAS secrets / CI vars win.
//
// IMPORTANT: keep in sync with CONFIG_KEYS in registry.ts.
// The spec lib/app-config/src/lib/config-aliases.spec.ts enforces this in CI.
const CONFIG_KEY_ALIASES = [
  ['EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'VITE_ROLLBAR_ACCESS_TOKEN'],
  ['EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY', 'VITE_GROWTHBOOK_CLIENT_KEY'],
  ['EXPO_PUBLIC_GIPHY_API_KEY', 'VITE_GIPHY_API_KEY'],
];

module.exports = { CONFIG_KEY_ALIASES };
