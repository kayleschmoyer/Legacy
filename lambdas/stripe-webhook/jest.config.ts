const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'stripe-webhook',
  projectPath: 'lambdas/stripe-webhook',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
  },
});
