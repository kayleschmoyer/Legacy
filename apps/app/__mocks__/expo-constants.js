// Manual Jest mock for expo-constants (LS-7558).
// expo-constants imports expo-modules-core which requires native globals
// unavailable in Jest. Provide a minimal stub for the values config.native.ts
// reads: Constants.expoConfig?.extra.
//
// __esModule: true is required for correct ES module interop. Without it,
// babel-jest's _interopRequireDefault wraps the export in an extra layer:
//   require('expo-constants')           → { default: { expoConfig: ... } }
//   _interopRequireDefault(require())   → { default: { default: { expoConfig: ... } } }
//   Constants (= result.default)        → { default: { expoConfig: ... } }
//   Constants.expoConfig                → undefined  ← wrong
// With __esModule: true the interop is skipped and Constants.expoConfig works.
//
// Native-required keys (LS-7701) must be present so buildNativeConfig() does
// not throw when the module is evaluated during test suite setup.
module.exports = {
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        graphqlHost: 'https://test.api.example.com/graphql',
        oauthProxy: 'https://test.oauth.example.com',
        googleClientId: 'test-google-client-id',
      },
    },
  },
};
