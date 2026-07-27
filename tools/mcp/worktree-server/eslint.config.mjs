import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['tools/mcp/worktree-server/tsconfig.*?.json'],
      },
    },
  },
  {
    ignores: ['**/dist'],
  },
];
