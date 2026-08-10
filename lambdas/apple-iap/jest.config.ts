const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'apple-iap',
  projectPath: 'lambdas/apple-iap',
});
