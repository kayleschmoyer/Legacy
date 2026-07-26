import type { Config } from 'jest';

const config: Config = {
  displayName: 'rollbar-jira-reconcile',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/tools/rollbar-jira-reconcile',
};

export default config;
