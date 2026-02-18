const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'sentry',
  projectPath: 'lib/sentry',
});
