const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'mcp-jobs',
  projectPath: 'lib/mcp-jobs',
});
