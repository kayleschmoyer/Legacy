const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'websocket',
  projectPath: 'lambdas/websocket',
});
