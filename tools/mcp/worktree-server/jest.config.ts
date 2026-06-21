import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-worktree-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.+)\\.js$': '$1',
    // Resolve the shared package path alias to source for ts-jest.
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
  },
  coverageDirectory: '../../../coverage/tools/mcp/worktree-server',
};

export default config;
