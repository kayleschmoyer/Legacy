const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'mcp-jobs',
  projectPath: 'lib/mcp-jobs',
});
