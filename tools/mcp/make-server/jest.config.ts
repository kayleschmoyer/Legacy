import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-make-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // Kept on ts-jest (LS-8902): specs depend on ts-jest's jest.mock
  // hoisting-above-imports pass, which @swc/jest does not implement (a
  // confirmed swc-project/swc limitation) — see lib/rollbar/jest.config.ts.
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.+)\\.js$': '$1',
    // Resolve the shared package path alias to source for @swc/jest.
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
    '^@legacy-sports/mcp-jobs$': '<rootDir>/../../../lib/mcp-jobs/src/index.ts',
  },
  coverageDirectory: '../../../coverage/tools/mcp/make-server',
};

export default config;
