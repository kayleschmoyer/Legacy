const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'analytics',
  projectPath: 'lib/analytics',
});
