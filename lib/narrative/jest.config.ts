const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'narrative',
  projectPath: 'lib/narrative',
});
