const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'narrative',
  projectPath: 'lib/narrative',
});
