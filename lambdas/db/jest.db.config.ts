import type { Config } from 'jest';

const config: Config = {
  displayName: 'db',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/lambdas/db',

  testMatch: ['**/*.db.spec.ts'],

  globalSetup: '<rootDir>/integration-test-global-setup.ts',
  globalTeardown: '<rootDir>/integration-test-global-teardown.ts',

  // PostgreSQL operations are slower than SQLite in-memory.
  testTimeout: 30000,

  transformIgnorePatterns: ['node_modules/(?!@legacy-sports)'],

  moduleNameMapper: {
    '^@legacy-sports/analytics$': '<rootDir>/../../lib/analytics/src/index.ts',
    '^@legacy-sports/api$': '<rootDir>/../../lib/api/src/index.ts',
    '^@legacy-sports/aws-utils$': '<rootDir>/../../lib/aws-utils/src/index.ts',
    '^@legacy-sports/bref-client$':
      '<rootDir>/../../lib/bref-client/src/index.ts',
    '^@legacy-sports/data-loaders$':
      '<rootDir>/../../lib/data-loaders/src/index.ts',
    '^@legacy-sports/db-client$': '<rootDir>/../../lib/db-client/src/index.ts',
    '^@legacy-sports/env-utilities$':
      '<rootDir>/../../lib/env-utilities/src/index.ts',
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src/index.ts',
    '^@legacy-sports/scheduling$':
      '<rootDir>/../../lib/scheduling/src/index.ts',
    '^@legacy-sports/scoring$': '<rootDir>/../../lib/scoring/src/index.ts',
    '^@legacy-sports/rollbar$': '<rootDir>/../../lib/rollbar/src/index.ts',
    '^@legacy-sports/shared-components$':
      '<rootDir>/../../lib/shared-components/src/index.ts',
    '^@legacy-sports/tamagui-config$':
      '<rootDir>/../../lib/tamagui-config/src/index.ts',
    '^@legacy-sports/ui-abstractions$':
      '<rootDir>/../../lib/ui-abstractions/src/index.ts',
    '^@legacy-sports/utils$': '<rootDir>/../../lib/utils/src/index.ts',
    '^@legacy-sports/utils/node$': '<rootDir>/../../lib/utils/src/node.ts',
  },

  maxWorkers: 1,
};

export default config;
