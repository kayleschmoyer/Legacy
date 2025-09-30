const { withNxMetro } = require('@nx/react-native');
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
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
    blockList: exclusionList([/^.*\.test\.tsx?$/]),
    nodeModulesPaths: [
      path.resolve(__dirname, '../../node_modules'),
      path.resolve(__dirname, './node_modules'),
    ],
    // Ensure expo packages are resolved correctly
    resolverMainFields: ['react-native', 'browser', 'main'],
    platforms: ['ios', 'android', 'native', 'web'],
    // Explicit alias for expo-linking to help with resolution
    alias: {
      'expo-linking': path.resolve(
        __dirname,
        '../../node_modules/expo-linking',
      ),
      // Platform-specific component resolution for React Native builds
      '__PLATFORM_COMPONENTS__': path.resolve(
        __dirname,
        '../../lib/shared-components/src/platform-components/mobile/index.ts',
      ),
    },
    // Custom resolver to block web-only dependencies and handle platform components
    resolveRequest: (context, moduleName, platform) => {
      // Block web-only OAuth library from being imported in mobile builds
      if (moduleName === '@react-oauth/google') {
        throw new Error(
          `❌ Cannot resolve @react-oauth/google - this is a web-only library.\n\n` +
          `✅ Use platform-components instead:\n` +
          `   import { OAuthProvider } from '@legacy-sports/shared-components'\n\n` +
          `📝 The mobile app should use the MobileOAuthProvider through the platform abstraction layer.`
        );
      }
      
      // Handle __PLATFORM_COMPONENTS__ magic string resolution
      if (moduleName === '__PLATFORM_COMPONENTS__') {
        const mobileComponentsPath = path.resolve(
          __dirname,
          '../../lib/shared-components/src/platform-components/mobile/index.ts'
        );
        return {
          filePath: mobileComponentsPath,
          type: 'sourceFile',
        };
      }
      
      // Use the default resolver for all other modules
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = withNxMetro(mergeConfig(defaultConfig, customConfig), {
  // Change this to true to see debugging info.
  debug: false,
  // all the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  extensions: [],
  // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
  watchFolders: [],
  // Add explicit node_modules paths for better resolution in CI
  nodeModulesPaths: [
    path.resolve(__dirname, '../../node_modules'),
    path.resolve(__dirname, './node_modules'),
  ],
});
