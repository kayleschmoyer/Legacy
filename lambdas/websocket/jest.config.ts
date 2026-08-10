const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'websocket',
  projectPath: 'lambdas/websocket',
});
