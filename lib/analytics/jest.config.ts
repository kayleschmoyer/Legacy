const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'analytics',
  projectPath: 'lib/analytics',
});
