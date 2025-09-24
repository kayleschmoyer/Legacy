/** @type {import('jest').Config} */
module.exports = {
  // Use jsdom environment for web testing (don't use react-native preset due to Flow parsing issues)
  testEnvironment: 'jsdom',

  // Basic configuration
  coverageDirectory: '../../coverage/lib/shared-components',
  displayName: 'shared-components',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],

  // Setup files - our setup will manually import React Native mocks
  setupFilesAfterEnv: ['<rootDir>/jest-setup-web.js'],

  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          jsx: 'react-jsx',
          types: ['node', 'jest', '@testing-library/jest-dom'],
        },
      },
    ],
    '^.+\\.(js|jsx)$': ['babel-jest'],
  },

  // Module name mapping
  moduleNameMapper: {
    // Platform components resolution
    '^__PLATFORM_COMPONENTS__$': '<rootDir>/src/platform-components/web',

    // Legacy Sports packages
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',

    // React Native mocking - use our custom mock that imports RN utilities
    '^react-native$': '<rootDir>/jest-react-native-mock.js',
    '^react-native/(.*)$': '<rootDir>/jest-react-native-mock.js',
    '^react-native-svg$': '<rootDir>/jest-react-native-mock.js',
    '^react-native-vector-icons/(.*)$': '<rootDir>/jest-react-native-mock.js',

    // Asset mocking
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
  },

  // Transform ignore patterns - minimal set since we're not using RN preset
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-svg|react-native-vector-icons|@react-native-community|@tamagui|tamagui)/)',
  ],

  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(test|spec).(ts|tsx|js)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx|js)',
  ],

  // Coverage collection
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};
