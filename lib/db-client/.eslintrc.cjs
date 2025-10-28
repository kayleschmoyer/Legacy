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
      files: ['*.js', '*.jsx'],
      rules: {},
    },
  ],
};
