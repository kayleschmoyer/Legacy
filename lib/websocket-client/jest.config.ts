const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'websocket-client',
  projectPath: 'lib/websocket-client',
});
