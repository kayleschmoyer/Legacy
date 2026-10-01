const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'scoring-utils',
  projectPath: 'lib/scoring-utils',
});
