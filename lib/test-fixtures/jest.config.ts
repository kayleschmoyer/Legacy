const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'test-fixtures',
  projectPath: 'lib/test-fixtures',
});
