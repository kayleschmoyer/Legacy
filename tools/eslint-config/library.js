/**
 * Library ESLint Configuration
 *
 * Configuration for shared libraries that are consumed by multiple projects.
 * Stricter rules to ensure library quality and consistency.
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
    // All library files
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        // Libraries should have stricter module boundaries
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            allow: [],
            depConstraints: [
              {
                sourceTag: 'scope:lib',
                onlyDependOnLibsWithTags: ['scope:lib'],
              },
              {
                sourceTag: 'type:ui',
                onlyDependOnLibsWithTags: [
                  'scope:lib',
                  'type:ui',
                  'type:config',
                  'platform:shared',
                ],
              },
              {
                sourceTag: 'type:data',
                onlyDependOnLibsWithTags: [
                  'scope:lib',
                  'type:data',
                  'type:config',
                ],
              },
              {
                sourceTag: 'type:config',
                onlyDependOnLibsWithTags: ['scope:lib', 'type:config'],
              },
            ],
          },
        ],

        // Stricter type safety for libraries
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'error',

        // No console logging in libraries (should use logging lib)
        'no-console': 'error',

        // Prevent debug code in libraries
        'no-debugger': 'error',
        'no-alert': 'error',
      },
    },

    // TypeScript library files
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        // Extra strict type checking for libraries
        '@typescript-eslint/strict-boolean-expressions': 'error',
        '@typescript-eslint/prefer-readonly': 'error',
        '@typescript-eslint/no-unnecessary-condition': 'error',

        // Ensure proper exports
        '@typescript-eslint/explicit-member-accessibility': [
          'error',
          {
            accessibility: 'explicit',
            overrides: {
              accessors: 'explicit',
              constructors: 'no-public',
              methods: 'explicit',
              properties: 'explicit',
              parameterProperties: 'explicit',
            },
          },
        ],
      },
    },

    // Library index/barrel files
    {
      files: ['**/index.ts', '**/index.tsx'],
      rules: {
        // Index files are just re-exports
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },

    // Library test files
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
        // Test files can be less strict
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        'no-console': 'off',
      },
    },

    // Configuration libraries (like tamagui-config)
    {
      files: [
        '**/config/**/*.ts',
        '**/*config*.ts',
        '**/tamagui-config/**/*.ts',
      ],
      rules: {
        // Config files need some flexibility
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
      },
    },

    // Logging library gets special console allowance
    {
      files: ['**/logging/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
