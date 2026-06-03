// Manual Jest mock for expo-constants (LS-7558).
// expo-constants imports expo-modules-core which requires native globals
// unavailable in Jest. Provide a minimal stub for the values config.native.ts
// reads: Constants.expoConfig?.extra.
module.exports = {
  default: {
    expoConfig: null,
  },
};
