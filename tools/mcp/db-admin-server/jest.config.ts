import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-db-admin-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // @swc/jest also transforms .js so jose's ESM dist can be required in CJS
  // test mode (see transformIgnorePatterns below).
  transform: {
    '^.+\\.[tj]sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true, decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  // Allow jose (ESM-only, used by mcp-bearer-auth) through the transform so its
  // `export` syntax doesn't trip Jest with "Unexpected token 'export'".
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // NodeNext resolution uses .js extensions in imports; strip them for @swc/jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
    // Resolve the @legacy-sports path aliases to source for @swc/jest. The
    // db-client mapper is only used so jest can *resolve* the specifier for
    // jest.mock(); the migrate spec replaces the module with a factory mock so
    // the real (AWS-SDK-pulling) module never executes.
    '^@legacy-sports/logging$': '<rootDir>/../../../lib/logging/src/index.ts',
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
    '^@legacy-sports/db-client/src/(.*)\\.js$':
      '<rootDir>/../../../lib/db-client/src/$1.ts',
  },
  coverageDirectory: '../../../coverage/tools/mcp/db-admin-server',
};

export default config;
