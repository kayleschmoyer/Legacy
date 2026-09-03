import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-android-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    // Also matches .mjs — android-env.ts imports scripts/run-android-dev.mjs
    // directly (reused, not reimplemented; see LS-8815), and that sibling
    // script's ESM `import` syntax needs the same CJS transform as our own
    // .ts sources to run under Jest.
    '^.+\\.m?[tj]sx?$': [
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
  moduleFileExtensions: ['ts', 'js', 'mjs'],
  moduleNameMapper: {
    '^(\\.{1,2}/.+)\\.js$': '$1',
    // Resolve the shared package path alias to source for @swc/jest.
    '^@legacy-sports/mcp-format$':
      '<rootDir>/../../../lib/mcp-format/src/index.ts',
  },
  coverageDirectory: '../../../coverage/tools/mcp/android-server',
};

export default config;
