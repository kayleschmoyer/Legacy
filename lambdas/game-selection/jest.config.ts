const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'game-selection',
  projectPath: 'lambdas/game-selection',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
  },
});
