export default {
  displayName: 'web',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-.*|@tamagui|tamagui)/)',
  ],
  moduleNameMapper: {
    '^react-native$': 'react-native-web',
    '^react-native-svg$': 'react-native-svg/lib/commonjs/ReactNativeSVG.web.js',
    '^@react-native-picker/picker$': '<rootDir>/src/__mocks__/react-native-picker.js',
    '^@react-navigation/native$': '<rootDir>/src/__mocks__/@react-navigation/native.js',
    '^@react-navigation/drawer$': '<rootDir>/src/__mocks__/@react-navigation/drawer.js',
    '^@react-navigation/stack$': '<rootDir>/src/__mocks__/@react-navigation/stack.js',
    '^@tamagui/lucide-icons$': '<rootDir>/src/__mocks__/tamagui-lucide-icons.js',
    '^@tamagui/config/v4$': '<rootDir>/src/__mocks__/@tamagui/config/v4.js',
    '^@tamagui/(.*)$': '<rootDir>/src/__mocks__/tamagui.js',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/web',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
