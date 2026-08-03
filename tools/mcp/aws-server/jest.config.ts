import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-aws-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: undefined,
  testRegex: 'src/.*\\.spec\\.ts$',
  coverageDirectory: '../../../coverage/tools/mcp/aws-server',
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true, decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Resolve the shared package path alias to source for @swc/jest.
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
    '^@legacy-sports/mcp-jobs$': '<rootDir>/../../../lib/mcp-jobs/src/index.ts',
  },
};

export default config;
