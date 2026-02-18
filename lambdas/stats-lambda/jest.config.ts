const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'load-stats-lambda',
  projectPath: 'lambdas/stats-lambda',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
  },
});
