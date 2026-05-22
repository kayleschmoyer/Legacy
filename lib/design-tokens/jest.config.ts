const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'design-tokens',
  projectPath: 'lib/design-tokens',
});
