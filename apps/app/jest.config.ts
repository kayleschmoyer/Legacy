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
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
};
