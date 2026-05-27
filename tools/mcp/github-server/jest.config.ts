import type { Config } from 'jest';

const config: Config = {
  displayName: 'mcp-github-server',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    // ts-jest also transforms .js files (allowJs is on via tsconfig.spec.json).
    // This lets us strip ESM `export` syntax from jose's dist so it can be
    // required in CJS test mode — the alternative (babel-jest) needs presets
    // that the repo doesn't configure.
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Default ignore-pattern excludes everything under node_modules from transforms.
  // Allow jose (ESM-only, used by mcp-bearer-auth) through so its `export`
  // syntax doesn't trip Jest with "Unexpected token 'export'".
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    // NodeNext resolution uses .js extensions in imports; strip them for ts-jest
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  coverageDirectory: '../../../coverage/tools/mcp/github-server',
};

export default config;
