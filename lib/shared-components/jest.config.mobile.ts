module.exports = {
  coverageDirectory: '../../coverage/lib/shared-components/mobile',
  displayName: 'shared-components:mobile',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
    '^__PLATFORM_COMPONENTS__$': '<rootDir>/src/platform-components/mobile',
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
  },
  setupFilesAfterEnv: ['<rootDir>/jest-setup-mobile.js'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-google-signin|expo|@expo|expo-secure-store|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
  // Everything under src/features/leagues/ (at any depth) was previously
  // blanket-excluded from mobile — those specs are web-oriented and not
  // mobile-safe (e.g. premium/premium-fields.spec.tsx expects DOM testids
  // the mobile icon mocks don't produce). Preserve that exclusion via a
  // negative lookahead so it keeps covering every file (current and
  // future) EXCEPT the one new, purpose-built mobile spec (LS-8852) — an
  // enumerated file list silently drifts out of sync as files are added
  // under leagues/ (subdirectories especially, as this one did on the
  // first pass).
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/features/leagues/(?!ProposeTradeDialogNativeModal\\.spec\\.tsx$)',
    // Web-only regression test (LS-8873): exercises the custom Popover-based
    // calendar picker (Platform.OS === 'web' branch), which crashes here
    // because Tamagui's Popover.Trigger/Overlay compound components aren't
    // resolvable under the RN mobile jest environment. Belongs to
    // shared-components:web only.
    '/src/components/DateTimePicker\\.navigateMonth\\.spec\\.tsx$',
  ],
  testRegex: '/src/.*\\.spec\\.(ts|tsx|js)$',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};
