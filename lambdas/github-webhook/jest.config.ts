const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'github-webhook',
  projectPath: 'lambdas/github-webhook',
});
