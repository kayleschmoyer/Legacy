// const { withNxMetro } = require('@nx/react-native');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const customConfig = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
  resolver: {
    assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'svg',
      'native.ts',
      'native.tsx',
    ],
    nodeModulesPaths: [
      path.resolve(__dirname, '../../node_modules'),
      path.resolve(__dirname, './node_modules'),
    ],
    // Ensure expo packages are resolved correctly.
    // Order matters: 'browser' must come before 'main' so that packages with a
    // browser-specific build (e.g. rollbar → dist/rollbar.umd.min.js) are
    // resolved instead of their Node.js server entry (rollbar → src/server/rollbar.js),
    // which depends on built-in Node modules (os, fs, …) not available on device.
    // This matches Metro's default field order for React Native.
    resolverMainFields: ['react-native', 'browser', 'main'],
    platforms: ['ios', 'android', 'native', 'web'],
    // Platform-specific file extensions (React Native will prefer .native.ts over .ts)
    // This allows us to have platform-specific implementations
    platformsMap: {
      native: ['native', 'ios', 'android'],
      android: ['android', 'native'],
      ios: ['ios', 'native'],
    },
    // Exclude test/spec files from the production bundle.
    // .spec.tsx files live inside src/app/(app)/ alongside route files so that
    // Expo Router co-locates tests with the screens they test. Without this
    // blockList, Metro processes them as part of the Expo Router route manifest
    // and they pull in @testing-library/react-native, which tries to
    // require('console') — a Node built-in that Metro cannot resolve.
    blockList: /.*\.(spec|test)\.[jt]sx?$|.*[/\\]__tests__[/\\].*/,
    // Explicit alias for expo-linking to help with resolution
    alias: {
      'expo-linking': path.resolve(
        __dirname,
        '../../node_modules/expo-linking',
      ),
      // Note: No special aliases needed since packages are now properly separated
    },
  },
};

// Standard Metro config for monorepo without Nx Metro integration
// This avoids the path resolution issues in CI while maintaining monorepo support
const finalConfig = mergeConfig(defaultConfig, customConfig);

// Add workspace folders for monorepo support
finalConfig.watchFolders = [
  // Workspace root for package resolution
  path.resolve(__dirname, '../..'),
  // Specific library directories
  path.resolve(__dirname, '../../lib'),
  path.resolve(__dirname, '../../tools'),
];

// Ensure proper module resolution for workspace packages
finalConfig.resolver = {
  ...finalConfig.resolver,
  nodeModulesPaths: [
    path.resolve(__dirname, '../../node_modules'),
    path.resolve(__dirname, './node_modules'),
  ],
};

module.exports = finalConfig;
