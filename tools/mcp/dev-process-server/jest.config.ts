import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-dev-process-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: undefined,
  testRegex: 'src/.*\\.spec\\.ts$',
  coverageDirectory: '../../../coverage/tools/mcp/dev-process-server',
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
};

export default config;
