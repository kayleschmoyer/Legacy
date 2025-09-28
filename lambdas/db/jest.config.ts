import type { Config } from 'jest';

/* eslint-disable */
const config: Config = {
  displayName: 'db',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/lambdas/db',
  setupFiles: ['<rootDir>/test-setup.ts'],
};

export default config;
