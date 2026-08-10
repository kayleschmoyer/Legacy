const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'pfr-client',
  projectPath: 'lib/pfr-client',
});
