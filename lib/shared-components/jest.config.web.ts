module.exports = {
  coverageDirectory: '../../coverage/lib/shared-components/web',
  displayName: 'shared-components:web',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
    '^__PLATFORM_COMPONENTS__$': '<rootDir>/src/platform-components/web',
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
  },
  setupFilesAfterEnv: ['<rootDir>/jest-setup-web.js'],
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
    'node_modules/(?!(@tamagui|tamagui|react-native-svg|@react-native-google-signin)/)',
  ],
  testRegex: '/src/.*\\.spec\\.(ts|tsx|js)$',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};
