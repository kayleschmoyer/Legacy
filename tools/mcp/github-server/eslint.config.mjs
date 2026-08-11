import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/jest.config.ts', '**/vite.config.ts', '**/dist'],
  },
];
