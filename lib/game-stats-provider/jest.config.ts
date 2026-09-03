const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'game-stats-provider',
  projectPath: 'lib/game-stats-provider',
});
