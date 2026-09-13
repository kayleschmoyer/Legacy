import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': 'off',
    },
    languageOptions: {
      parserOptions: {
        project: ['apps/cli/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/jest.config.ts', '**/dist'],
  },
];
