import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['lib/mcp-bearer-auth/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/jest.config.ts', '**/*.d.ts'],
  },
];
