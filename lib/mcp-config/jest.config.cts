const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'mcp-config',
  projectPath: 'lib/mcp-config',
});
