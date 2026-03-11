const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'apple-iap',
  projectPath: 'lambdas/apple-iap',
});
