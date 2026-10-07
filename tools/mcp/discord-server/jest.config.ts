import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-discord-server',
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
    '^@legacy-sports/mcp-docs$': '<rootDir>/../../../lib/mcp-docs/src/index.ts',
    '^@legacy-sports/mcp-docs/pages/discord$':
      '<rootDir>/../../../lib/mcp-docs/src/pages/discord.generated.ts',
    // NodeNext resolution uses .js extensions in imports; strip them for @swc/jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
    // Resolve the shared package path aliases to source for @swc/jest.
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
    '^@legacy-sports/mcp-bearer-auth$':
      '<rootDir>/../../../lib/mcp-bearer-auth/src/index.ts',
  },
  coverageDirectory: '../../../coverage/tools/mcp/discord-server',
};

export default config;
