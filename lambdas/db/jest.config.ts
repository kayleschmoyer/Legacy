import type { Config } from 'jest';

const config: Config = {
  displayName: 'db',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/lambdas/db',
  setupFiles: ['<rootDir>/test-setup.ts'],
  // Explicitly transform workspace packages and jose (ESM-only build at jose@6,
  // hoisted to root node_modules; the schema imports it via apple-jws.ts).
  transformIgnorePatterns: ['node_modules/(?!(@legacy-sports|jose)/)'],
};

export default config;
