const { withNxMetro } = require('@nx/react-native');
const { getDefaultConfig } = require('@react-native/metro-config');
const { mergeConfig } = require('metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = {
  cacheVersion: 'app-v2',
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
    // Ensure proper serializer format
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
  serializer: {
    // Ensure proper JSON output format
    createModuleIdFactory: () => (path) => {
      return require('crypto')
        .createHash('sha1')
        .update(path)
        .digest('hex')
        .substr(0, 8);
    },
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    blockList: exclusionList([/^.*\.test\.tsx?$/]),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    alias: {
      // Tamagui requires these aliases
      'react-native-svg': '@react-native-svg/react-native-svg',
    },
  },
  // Add Tamagui configuration
  watchFolders: [
    path.resolve(__dirname, '../../node_modules/@tamagui'),
    path.resolve(__dirname, '../../tamagui.config.ts'),
  ],
};

module.exports = withNxMetro(mergeConfig(defaultConfig, customConfig), {
  // Change this to true to see debugging info.
  // Useful if you have issues resolving modules
  debug: false,
  // all the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  extensions: [],
  // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
  watchFolders: [],
});
