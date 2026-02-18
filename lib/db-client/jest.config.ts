const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'db-client',
  projectPath: 'lib/db-client',
});
