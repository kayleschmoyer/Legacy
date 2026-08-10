const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'scoring',
  projectPath: 'lib/scoring',
});
