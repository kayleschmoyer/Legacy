const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'pfa-client',
  projectPath: 'lib/pfa-client',
});
