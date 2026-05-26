const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'pfr-client',
  projectPath: 'lib/pfr-client',
});
