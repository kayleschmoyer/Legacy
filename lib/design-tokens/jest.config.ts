const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'design-tokens',
  projectPath: 'lib/design-tokens',
});
