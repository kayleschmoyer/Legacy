import baseConfig from '../../eslint.config.mjs';
import dbClientMockRule from './eslint-rules/db-client-mock.cjs';

export default [
  ...baseConfig,
  {
    // LS-10079: a partial @legacy-sports/db-client mock crashes every schema
    // module that reads what it left out, at import time. Its own rule name
    // (not a no-restricted-syntax selector) so it can't clobber, or be
    // clobbered by, the root config's no-restricted-syntax blocks.
    files: ['**/*.ts'],
    plugins: {
      'legacy-sports-db': { rules: { 'db-client-mock': dbClientMockRule } },
    },
    rules: { 'legacy-sports-db/db-client-mock': 'error' },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [
            '@apollo/server',
            '@as-integrations/aws-lambda',
            '@legacy-sports/db-client',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parserOptions: {
        project: ['lambdas/db/tsconfig.*?.json'],
      },
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: [
      '**/integration-test-*.ts',
      '**/__fixtures__/**/*.ts',
      '**/fixtures/**/*.ts',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    ignores: [
      '**/jest.config.ts',
      '**/dist',
      '**/src/.startup.ts',
      '**/index.js',
      'scripts/print-schema.ts',
      'test-setup.ts',
    ],
  },
];
