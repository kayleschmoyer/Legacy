const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'tamagui-config',
  projectPath: 'lib/tamagui-config',
  overrides: {
    testEnvironment: 'jsdom',
    moduleNameMapper: {
      '^react-native$': 'react-native-web',
    },
    transformIgnorePatterns: [
      'node_modules/(?!(react-native|@react-native|@tamagui|tamagui)/)',
    ],
  },
});
