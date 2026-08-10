const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'test-fixtures',
  projectPath: 'lib/test-fixtures',
});
