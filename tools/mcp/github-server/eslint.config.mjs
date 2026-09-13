import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [
          'tools/mcp/github-server/tsconfig.json',
          'tools/mcp/github-server/tsconfig.spec.json',
        ],
      },
    },
  },
  {
    ignores: ['**/jest.config.ts', '**/vite.config.ts', '**/dist'],
  },
];
