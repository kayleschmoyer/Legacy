const rnPreset = require('react-native/jest-preset');
const expoPreset = require('jest-expo/jest-preset');

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
    '^expo-image-picker$': '<rootDir>/__mocks__/expo-image-picker.js',
    '^@legacy-sports/rollbar/native$': '<rootDir>/../../lib/rollbar/src/native',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
    // LS-9423: deep icon imports (@tamagui/lucide-icons/icons/<Name>) must
    // route to the same specifier as the barrel import so per-spec-file
    // `jest.mock('@tamagui/lucide-icons', ...)` overrides (many spec files
    // define their own, e.g. MatchupWinProbabilityPanel.spec.tsx) still
    // take effect. Without this, deep imports load the real package,
    // which needs a live TamaguiProvider/theme these specs don't set up.
    '^@tamagui/lucide-icons/icons/.*$': '@tamagui/lucide-icons',
  },
  globals: {
    __DEV__: true,
  },
  // LS-10639: jest-expo's preset setupFiles are the React Native setup plus
  // jest-expo's own, which installs `globalThis.expo` (EventEmitter,
  // NativeModule, …) and mocks the native Expo modules. Without it any spec
  // that loads expo-modules-core at runtime — e.g. `renderRouter` from
  // `expo-router/testing-library` — dies with "Cannot read properties of
  // undefined (reading 'EventEmitter')".
  setupFiles: [
    ...(expoPreset.setupFiles || []),
    '<rootDir>/jest.setup-expo-globals.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc.js',
      },
    ],
  },
  // `expo(-[^/]+)?` transforms every expo-* package (as jest-expo's preset
  // does): expo-router's runtime pulls in ESM-only ones such as expo-linking
  // and expo-glass-effect (LS-10639).
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo(-[^/]+)?|@expo|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
};
