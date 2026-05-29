export default {
  coverageDirectory: '../../coverage/lib/shared-components',
  displayName: 'shared-components',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
    '^__PLATFORM_COMPONENTS__$': '<rootDir>/src/platform-components/web',
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
  },
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
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
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|@sentry/react-native|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
  testRegex: '/src/.*\\.spec\\.(ts|tsx|js)$',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};
