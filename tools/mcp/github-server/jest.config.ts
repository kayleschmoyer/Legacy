import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-github-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // NodeNext resolution uses .js extensions in imports; strip them for ts-jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  coverageDirectory: '../../../coverage/tools/mcp/github-server',
};

export default config;
