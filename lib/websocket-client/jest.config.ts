const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'websocket-client',
  projectPath: 'lib/websocket-client',
});
