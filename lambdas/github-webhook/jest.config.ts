const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'github-webhook',
  projectPath: 'lambdas/github-webhook',
});
