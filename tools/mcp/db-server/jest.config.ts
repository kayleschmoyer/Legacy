import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-db-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // NodeNext resolution uses .js extensions in imports; strip them for ts-jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  coverageDirectory: '../../../coverage/tools/mcp/db-server',
};

export default config;
