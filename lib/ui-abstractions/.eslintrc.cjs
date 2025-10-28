const path = require('node:path');

module.exports = {
  extends: [
    'plugin:@nx/react',
    path.resolve(__dirname, '../../.eslintrc.json'),
  ],
  ignorePatterns: ['!**/*', 'dist', 'node_modules/**'],
  parserOptions: {
    project: [
      'lib/ui-abstractions/tsconfig.json',
      'lib/ui-abstractions/tsconfig.lib.json',
    ],
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      parserOptions: {
        project: ['lib/ui-abstractions/tsconfig.*?.json'],
      },
      rules: {},
    },
    {
      files: ['*.js', '*.jsx'],
      rules: {},
    },
  ],
};
