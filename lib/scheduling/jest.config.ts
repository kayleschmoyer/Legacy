const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'scheduling',
  projectPath: 'lib/scheduling',
});
