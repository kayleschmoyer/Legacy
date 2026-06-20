import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-aws-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: undefined,
  testRegex: 'src/.*\\.spec\\.ts$',
  coverageDirectory: '../../../coverage/tools/mcp/aws-server',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

export default config;
