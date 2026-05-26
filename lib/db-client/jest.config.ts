const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'db-client',
  projectPath: 'lib/db-client',
  // Cap worker count to prevent OOM when running alongside other suites on CI.
  overrides: { maxWorkers: 2 },
});
