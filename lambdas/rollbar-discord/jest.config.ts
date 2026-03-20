const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'rollbar-discord',
  projectPath: 'lambdas/rollbar-discord',
});
