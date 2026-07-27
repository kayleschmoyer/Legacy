import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
    },
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.*?.json'],
      },
    },
  },
  {
    files: [
      '**/src/cli/**/*.ts',
      '**/src/scripts/**/*.ts',
      '**/check-constraints.ts',
      '**/test-drizzle-version.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      '**/jest.config.ts',
      '**/src/drizzle/*',
      '**/dist/**/*',
      '**/migrations/**/*',
    ],
  },
];
