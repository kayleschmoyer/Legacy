const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'game-selection',
  projectPath: 'lambdas/game-selection',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
  },
});
