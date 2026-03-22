/**
 * E2E Testing ESLint Configuration
 *
 * Configuration for end-to-end test files (Playwright, Cypress, etc.).
 * More permissive rules suitable for testing code.
 */

module.exports = {
  root: false,
  extends: ['./base'],
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  overrides: [
    // All E2E test files
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
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
    {
      files: ['**/*.spec.ts', '**/playwright/**/*.ts', '**/e2e/**/*.ts'],
      extends: ['plugin:playwright/recommended'],
      rules: {
        // Playwright specific rules
        'playwright/expect-expect': 'error',
        'playwright/no-page-pause': 'warn',
        'playwright/no-skipped-test': 'warn',
      },
    },

    // Cypress specific files
    {
      files: ['**/cypress/**/*.ts', '**/cypress/**/*.js'],
      extends: ['plugin:cypress/recommended'],
      env: {
        'cypress/globals': true,
      },
      rules: {
        // Cypress specific rules
        'cypress/no-unnecessary-waiting': 'error',
        'cypress/no-assigning-return-values': 'error',
      },
    },

    // WebDriverIO specific files
    {
      files: ['**/webdriverio/**/*.ts', '**/*.wdio.ts', '**/wdio/**/*.ts'],
      extends: ['plugin:webdriverio/recommended'],
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
  ],
};
