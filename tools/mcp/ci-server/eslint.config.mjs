import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['tools/mcp/ci-server/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/vite.config.ts', '**/dist'],
  },
];
