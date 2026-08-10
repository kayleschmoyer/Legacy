const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'mlb-client',
  projectPath: 'lib/mlb-client',
});
