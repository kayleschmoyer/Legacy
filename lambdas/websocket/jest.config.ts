const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'websocket',
  projectPath: 'lambdas/websocket',
  overrides: {
    transform: {
      '^.+\\.[tj]s$': [
        'ts-jest',
        {
          tsconfig: '<rootDir>/tsconfig.spec.json',
          // Source file has pre-existing TS issues (aws-lambda V2 type gaps,
          // DynamoDB index-signature access style) that don't affect runtime.
          // Type checking is handled by the separate typecheck target.
          diagnostics: false,
        },
      ],
    },
  },
});
