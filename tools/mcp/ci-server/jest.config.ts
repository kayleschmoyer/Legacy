import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-ci-server',
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
  },
  coverageDirectory: '../../../coverage/tools/mcp/ci-server',
};

export default config;
