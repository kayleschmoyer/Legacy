const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'mlb-client',
  projectPath: 'lib/mlb-client',
});
