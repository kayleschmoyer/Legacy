const path = require('node:path');

module.exports = {
  extends: [path.resolve(__dirname, '../../.eslintrc.json')],
  ignorePatterns: ['!**/*', 'node_modules/**/*', '**/node_modules/**'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {},
    },
    {
      files: ['*.ts', '*.tsx'],
      rules: {},
    },
    {
      files: ['*.js', '*.jsx'],
      rules: {},
    },
    {
      files: ['*.json'],
      parser: 'jsonc-eslint-parser',
      rules: {
        '@nx/dependency-checks': [
          'error',
          {
            ignoredFiles: [
              '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            ],
          },
        ],
      },
    },
  ],
};
