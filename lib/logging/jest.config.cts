const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'logging',
  projectPath: 'lib/logging',
});
