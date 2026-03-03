const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'rollbar',
  projectPath: 'lib/rollbar',
});
