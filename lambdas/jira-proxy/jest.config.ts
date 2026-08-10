const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'jira-proxy',
  projectPath: 'lambdas/jira-proxy',
});
