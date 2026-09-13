import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parserOptions: {
        project: [
          'tools/mcp/db-admin-server/tsconfig.json',
          'tools/mcp/db-admin-server/tsconfig.spec.json',
        ],
      },
    },
  },
  {
    ignores: ['**/jest.config.ts', '**/vite.config.ts', '**/dist'],
  },
];
