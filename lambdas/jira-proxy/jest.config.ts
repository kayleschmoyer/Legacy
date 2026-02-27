const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'jira-proxy',
  projectPath: 'lambdas/jira-proxy',
});
