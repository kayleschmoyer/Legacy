import type { Config } from 'jest';

const config: Config = {
  displayName: 'db',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/lambdas/db',
  setupFiles: [
    '<rootDir>/../../lib/db-client/src/testing/setup.ts',
    '<rootDir>/test-setup.ts',
  ],
  // Unit suite only: *.db.spec.ts files need a live PostgreSQL instance and run
  // via the `db:test:db` target (jest.db.config.ts) in run-db-tests.yml.
  testPathIgnorePatterns: ['/node_modules/', '\\.db\\.spec\\.ts$'],
  // Explicitly transform workspace packages and jose (ESM-only build at jose@6,
  // hoisted to root node_modules; the schema imports it via apple-jws.ts).
  transformIgnorePatterns: ['node_modules/(?!(@legacy-sports|jose)/)'],
  // ~40 resolver specs jest.resetModules() and re-require the full Pothos
  // schema in beforeEach, so a worker's heap grows file over file. Under CI's
  // NODE_OPTIONS=--max_old_space_size=2048 a long-lived worker hit the heap
  // limit and crashed a different suite each run (LS-10128). Recycle a worker
  // between files once it holds more than 1GB so each file starts well under
  // the cap.
  workerIdleMemoryLimit: '1GB',
};

export default config;
