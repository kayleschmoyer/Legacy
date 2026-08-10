const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'app-config',
  projectPath: 'lib/app-config',
});
