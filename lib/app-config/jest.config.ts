const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'app-config',
  projectPath: 'lib/app-config',
});
