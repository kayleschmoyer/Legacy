// const { withNxMetro } = require('@nx/react-native');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');
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
    blockList: exclusionList([/^.*\.test\.tsx?$/]),
    nodeModulesPaths: [
      path.resolve(__dirname, '../../node_modules'),
      path.resolve(__dirname, './node_modules'),
    ],
    // Ensure expo packages are resolved correctly
    resolverMainFields: ['react-native', 'main', 'browser'],
    platforms: ['ios', 'android', 'native', 'web'],
    // Platform-specific file extensions (React Native will prefer .native.ts over .ts)
    // This allows us to have platform-specific implementations
    platformsMap: {
      native: ['native', 'ios', 'android'],
      android: ['android', 'native'],
      ios: ['ios', 'native'],
    },
    // Explicit alias for expo-linking to help with resolution
    alias: {
      'expo-linking': path.resolve(
        __dirname,
        '../../node_modules/expo-linking',
      ),
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
