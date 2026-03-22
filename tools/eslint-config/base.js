/**
 * Base ESLint Configuration
 *
 * Foundational rules that apply to all TypeScript/JavaScript code in the workspace.
 * Other configurations should extend this base.
 */

module.exports = {
  root: false,
  ignorePatterns: [
    'dist',
    'node_modules',
    '.expo',
    'web-build',
    'cache',
    '**/*.d.ts',
    'coverage',
  ],
  extends: ['@nx/eslint-plugin-nx/recommended'],
  plugins: ['@nx', '@typescript-eslint', 'import'],
  overrides: [
    // All JavaScript/TypeScript files
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        // Console usage - error by default, but can be overridden
        'no-console': 'error',

        // Import organization
        'import/order': [
          'error',
          {
            groups: [
              'builtin',
              'external',
              'internal',
              ['parent', 'sibling'],
              'index',
            ],
            'newlines-between': 'always',
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
          },
        ],

        // General code quality
        'prefer-const': 'error',
        'no-var': 'error',
        'no-unused-vars': 'off', // Handled by TypeScript
        eqeqeq: ['error', 'always'],

        // Nx workspace module boundaries
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            allow: [],
            depConstraints: [
              {
                sourceTag: '*',
                onlyDependOnLibsWithTags: ['*'],
              },
            ],
          },
        ],
      },
    },

    // TypeScript specific rules
    {
      files: ['*.ts', '*.tsx'],
      extends: [
        'plugin:@nx/typescript',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-type-checked',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['tsconfig.*?.json'],
      },
      rules: {
        // Type safety - critical for workspace consistency
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',

        // Prevent unused code
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],

        // Function and variable declarations
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
      },
    },

    // JavaScript specific rules (for config files, scripts, etc.)
    {
      files: ['*.js', '*.jsx'],
      rules: {
        // Relax some rules for JavaScript files
        '@typescript-eslint/no-var-requires': 'off',
      },
    },

    // Allow console in specific contexts
    {
      files: [
        'tools/**/*.js',
        'scripts/**/*.js',
        '*.config.js',
        'test-*.js',
        '**/logging/src/**/*.ts',
        'apps/cli/**/*.ts',
      ],
      rules: {
        'no-console': 'off',
      },
    },

    // Test files get relaxed rules
    {
      files: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/test/**/*.ts',
        '**/test/**/*.tsx',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },
  ],
};
