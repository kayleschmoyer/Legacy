import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-nx-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  coverageDirectory: '../../../coverage/tools/mcp/nx-server',
};

export default config;
