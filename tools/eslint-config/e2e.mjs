/**
 * E2E Testing ESLint Configuration (flat config)
 *
 * Configuration for end-to-end test files (Playwright, Cypress, etc.).
 * More permissive rules suitable for testing code.
 *
 * Framework-specific blocks (Cypress, WebDriverIO) resolve their plugin via
 * `FlatCompat`, matching the peerDependencies contract in package.json: a
 * consumer that wants that framework's rules installs the matching
 * eslint-plugin-* package itself.
 */
import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import globals from 'globals';

import baseConfig from './base.mjs';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      ecmaVersion: 2022,
    },
  },

  // All E2E test files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // E2E tests don't need to follow strict module boundaries
      '@nx/enforce-module-boundaries': 'off',

      // Console logging is useful for debugging tests
      'no-console': 'off',

      // E2E tests often use any for test data
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Test files don't need explicit return types
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Allow unused variables with _ prefix (common in test setups)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Import organization is less critical in tests
      'import/order': 'warn',

      // Allow var declarations in legacy test code
      'no-var': 'warn',
      'prefer-const': 'warn',
    },
  },

  // Playwright specific files
  ...compat
    .config({
      extends: ['plugin:playwright/recommended'],
    })
    .map((config) => ({
      ...config,
      files: ['**/*.spec.ts', '**/playwright/**/*.ts', '**/e2e/**/*.ts'],
      rules: {
        ...config.rules,
        'playwright/expect-expect': 'error',
        'playwright/no-page-pause': 'warn',
        'playwright/no-skipped-test': 'warn',
      },
    })),

  // Cypress specific files
  ...compat
    .config({
      extends: ['plugin:cypress/recommended'],
    })
    .map((config) => ({
      ...config,
      files: ['**/cypress/**/*.ts', '**/cypress/**/*.js'],
      rules: {
        ...config.rules,
        'cypress/no-unnecessary-waiting': 'error',
        'cypress/no-assigning-return-values': 'error',
      },
    })),

  // WebDriverIO specific files.
  // eslint-plugin-webdriverio ships globals only (no `configs.recommended`
  // to extend from — see its `environments.wdio.globals`), so this block
  // sets the globals + rule directly instead of going through FlatCompat.
  {
    files: ['**/webdriverio/**/*.ts', '**/*.wdio.ts', '**/wdio/**/*.ts'],
    languageOptions: {
      globals: {
        browser: false,
        $: false,
        $$: false,
      },
    },
    rules: {
      // WebDriverIO uses global browser object
      'no-undef': 'off',
    },
  },

  // Test configuration files
  {
    files: [
      '**/playwright.config.ts',
      '**/cypress.config.ts',
      '**/wdio.conf.ts',
      '**/*.config.ts',
    ],
    rules: {
      // Config files need maximum flexibility
      '@typescript-eslint/no-var-requires': 'off',
      'no-console': 'off',
    },
  },
];
