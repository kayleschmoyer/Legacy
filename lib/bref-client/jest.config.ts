const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'bref-client',
  projectPath: 'lib/bref-client',
});
