import baseConfig from '../../eslint.config.mjs';
import nx from '@nx/eslint-plugin';
import globals from 'globals';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.browser,
        ...globals.node,
        driver: 'readonly',
        browser: 'readonly',
        $: 'readonly',
        $$: 'readonly',
        expect: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
    },
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.*?.json'],
      },
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
