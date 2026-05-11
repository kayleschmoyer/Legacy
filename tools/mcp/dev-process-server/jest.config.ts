import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-dev-process-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: undefined,
  testRegex: 'src/.*\\.spec\\.ts$',
  coverageDirectory: '../../../coverage/tools/mcp/dev-process-server',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};

export default config;
