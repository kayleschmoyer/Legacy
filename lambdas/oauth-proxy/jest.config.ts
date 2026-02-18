const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'oauth-proxy',
  projectPath: 'lambdas/oauth-proxy',
  overrides: {
    setupFiles: ['<rootDir>/test-setup.ts'],
  },
});
