const path = require('node:path');

module.exports = {
  extends: [path.resolve(__dirname, '../../.eslintrc.json')],
  ignorePatterns: ['!**/*', 'src/drizzle/*', 'dist/**/*', 'node_modules/**/*'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {},
    },
    {
      files: ['*.ts', '*.tsx'],
      parserOptions: {
        project: ['tsconfig.*?.json'],
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
      },
    },
    {
      // Migration files legitimately use PgDatabase<any> since they work with raw SQL
      files: ['migrations/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
    {
      files: ['*.js', '*.jsx'],
      rules: {},
    },
  ],
};
