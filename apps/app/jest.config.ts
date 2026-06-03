const rnPreset = require('react-native/jest-preset');

module.exports = {
  ...rnPreset,
  coverageDirectory: '../../coverage/apps/app',
  displayName: 'app',
  moduleFileExtensions: [
    'native.ts',
    'native.tsx',
    'ts',
    'tsx',
    'native.js',
    'native.jsx',
    'js',
    'jsx',
    'json',
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
    '^@legacy-sports/shared-components/(.*)$':
      '<rootDir>/../../lib/shared-components/src/entry/$1',
    // Subpath exports need explicit entries before the general pattern because
    // the general rule maps e.g. rollbar/native → lib/rollbar/native/src (wrong).
    '^@legacy-sports/app-config/native$':
      '<rootDir>/../../lib/app-config/src/native',
    '^@legacy-sports/app-config/web$': '<rootDir>/../../lib/app-config/src/web',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.js',
    '^@legacy-sports/rollbar/native$': '<rootDir>/../../lib/rollbar/src/native',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
  },
  globals: {
    __DEV__: true,
  },
  setupFiles: [...(rnPreset.setupFiles || [])],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc.js',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo-router|expo-asset|expo-modules-core|expo-constants|expo|@expo|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
};
