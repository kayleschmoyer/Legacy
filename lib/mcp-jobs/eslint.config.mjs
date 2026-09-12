import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['lib/mcp-jobs/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/jest.config.cts', '**/*.d.ts'],
  },
];
