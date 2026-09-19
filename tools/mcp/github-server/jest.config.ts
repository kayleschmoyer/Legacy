import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-github-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // @swc/jest also transforms .js files. This lets us strip ESM `export`
  // syntax from jose's dist so it can be required in CJS test mode — the
  // alternative (babel-jest) needs presets that the repo doesn't configure.
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
  // Default ignore-pattern excludes everything under node_modules from transforms.
  // Allow jose (ESM-only, used by mcp-bearer-auth) through so its `export`
  // syntax doesn't trip Jest with "Unexpected token 'export'".
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@legacy-sports/mcp-docs$': '<rootDir>/../../../lib/mcp-docs/src/index.ts',
    '^@legacy-sports/mcp-docs/pages/github$':
      '<rootDir>/../../../lib/mcp-docs/src/pages/github.generated.ts',
    '^@legacy-sports/mcp-jobs$': '<rootDir>/../../../lib/mcp-jobs/src/index.ts',
    // NodeNext resolution uses .js extensions in imports; strip them for @swc/jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  coverageDirectory: '../../../coverage/tools/mcp/github-server',
};

export default config;
