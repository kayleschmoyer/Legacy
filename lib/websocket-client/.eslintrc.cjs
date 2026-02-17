const path = require('node:path');

module.exports = {
  extends: [path.resolve(__dirname, '../../.eslintrc.json')],
  ignorePatterns: ['!**/*', '**/*.d.ts'],
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
      rules: {},
    },
    {
      files: ['*.js', '*.jsx'],
      rules: {},
    },
  ],
};
