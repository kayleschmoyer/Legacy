const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'load-stats-lambda',
  projectPath: 'lambdas/stats-lambda',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
    // Kept on ts-jest (LS-8902): specs depend on ts-jest's jest.mock
    // hoisting-above-imports pass, which @swc/jest does not implement (a
    // confirmed swc-project/swc limitation) — see lib/rollbar/jest.config.ts.
    transform: {
      '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
  },
});
