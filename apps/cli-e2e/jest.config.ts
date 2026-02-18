const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'cli-e2e',
  projectPath: 'apps/cli-e2e',
  overrides: {
    setupFiles: ['<rootDir>/src/test-setup.ts'],
    coverageDirectory: '../../coverage/cli-e2e',
  },
});
