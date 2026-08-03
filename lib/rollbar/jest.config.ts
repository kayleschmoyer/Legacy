const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'rollbar',
  projectPath: 'lib/rollbar',
  overrides: {
    // Kept on ts-jest (LS-8902): specs mock() a variable declared later in the
    // same file (e.g. RollbarCtorMock), which relies on ts-jest's jest.mock
    // hoisting-above-imports pass. @swc/jest does not hoist jest.mock() calls
    // (a confirmed swc-project/swc limitation, not fixable via config), so
    // under @swc/jest this throws "Cannot access '...' before initialization".
    transform: {
      '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
  },
});
