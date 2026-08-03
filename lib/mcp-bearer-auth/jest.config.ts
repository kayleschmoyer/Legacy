const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'mcp-bearer-auth',
  projectPath: 'lib/mcp-bearer-auth',
  overrides: {
    // jose is ESM-only; let @swc/jest transform it (the default transform
    // pattern also matches .js) instead of choking on its `export` syntax.
    transformIgnorePatterns: ['/node_modules/(?!jose/)'],
    // NodeNext-style imports use .js extensions; strip them for @swc/jest.
    moduleNameMapper: {
      '^(\\.{1,2}/.+)\\.js$': '$1',
    },
  },
});
