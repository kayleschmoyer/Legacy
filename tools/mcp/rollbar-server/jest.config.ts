import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-rollbar-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    // ts-jest also transforms .js so jose's ESM dist can be required in CJS
    // test mode (see transformIgnorePatterns below).
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Allow jose (ESM-only, used by mcp-bearer-auth) through the transform so its
  // `export` syntax doesn't trip Jest with "Unexpected token 'export'".
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // NodeNext resolution uses .js extensions in imports; strip them for ts-jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
    // Resolve the shared package path aliases to source for ts-jest.
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
    '^@legacy-sports/mcp-bearer-auth$':
      '<rootDir>/../../../lib/mcp-bearer-auth/src/index.ts',
  },
  coverageDirectory: '../../../coverage/tools/mcp/rollbar-server',
};

export default config;
