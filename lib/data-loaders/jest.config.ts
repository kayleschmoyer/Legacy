const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'data-loaders',
  projectPath: 'lib/data-loaders',
});
