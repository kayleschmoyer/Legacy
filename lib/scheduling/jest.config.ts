const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'scheduling',
  projectPath: 'lib/scheduling',
});
