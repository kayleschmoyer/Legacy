import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parserOptions: {
        project: ['lambdas/oauth-proxy/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/jest.config.ts', '**/dist'],
  },
];
