export default {
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
    'node_modules/(?!(react-native|@react-native|@react-native-google-signin|expo|@expo|expo-secure-store|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|@sentry/react-native|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
  testMatch: ['<rootDir>/src/**/*.spec.(ts|tsx|js)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};
