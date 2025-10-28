const path = require('node:path');

module.exports = {
  extends: [path.resolve(__dirname, '../../.eslintrc.lib.json')],
  ignorePatterns: ['dist'],
  parserOptions: {
    project: './tsconfig.json',
  },
};
