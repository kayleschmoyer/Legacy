const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'data-loaders',
  projectPath: 'lib/data-loaders',
});
