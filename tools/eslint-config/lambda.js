/**
 * Lambda ESLint Configuration
 *
 * Configuration for AWS Lambda functions with Node.js runtime.
 * Extends the base configuration with lambda-specific rules and allowances.
 */

module.exports = {
  root: false,
  extends: ['./base'],
  env: {
    node: true,
    es2022: true,
  },
  overrides: [
    // All lambda files
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        // Lambda-specific module boundaries
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            allow: [
              // Allow AWS SDK and Lambda runtime imports
              '@apollo/server',
              '@as-integrations/aws-lambda',
              'aws-lambda',
              '@aws-sdk/**',
            ],
            depConstraints: [
              {
                sourceTag: 'scope:lambda',
                onlyDependOnLibsWithTags: [
                  'scope:lib',
                  'type:data',
                  'type:api',
                ],
              },
            ],
          },
        ],

        // Console is acceptable in lambdas for CloudWatch logging
        'no-console': 'off',

        // Process.env access is common in lambdas
        'n/no-process-env': 'off',
      },
    },

    // Lambda handler files specifically
    {
      files: ['**/handler.ts', '**/index.ts', '**/lambda.ts'],
      rules: {
        // Handler functions often need flexible return types
        '@typescript-eslint/explicit-function-return-type': 'off',

        // Event objects from AWS can be complex
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
      },
    },

    // Lambda test files
    {
      files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
      rules: {
        // Test files can be more permissive with any usage
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },

    // Lambda configuration files
    {
      files: [
        '**/serverless.yml',
        '**/serverless.ts',
        '**/*.config.js',
        '**/vite.config.ts',
      ],
      rules: {
        // Config files need flexibility
        '@typescript-eslint/no-var-requires': 'off',
        'no-console': 'off',
      },
    },
  ],
};
