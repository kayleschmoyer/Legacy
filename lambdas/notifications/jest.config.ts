const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'notifications',
  projectPath: 'lambdas/notifications',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
  },
});
