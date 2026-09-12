import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['lib/mcp-docs/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/jest.config.cts', '**/*.d.ts', 'src/pages/*.generated.ts'],
  },
];
