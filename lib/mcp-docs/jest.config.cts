const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'mcp-docs',
  projectPath: 'lib/mcp-docs',
});
