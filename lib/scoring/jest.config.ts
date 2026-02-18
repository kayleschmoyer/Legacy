const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'scoring',
  projectPath: 'lib/scoring',
});
