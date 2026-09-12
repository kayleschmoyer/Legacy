import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        // `tsconfig.*?.json` matches only tsconfig.spec.json, so a source
        // file reaches the type-aware program solely by being imported from a
        // spec. The CLI entry deliberately is not (its `import.meta.url` guard
        // cannot load under the CommonJS test runner — that is why the
        // parsing lives in the separately-specced audit-cli-args.ts), so name
        // the app tsconfig too rather than widening the spec config with
        // non-spec sources (LS-8890).
        project: [
          'tools/mcp/ci-server/tsconfig.json',
          'tools/mcp/ci-server/tsconfig.*?.json',
        ],
      },
    },
  },
  {
    ignores: ['**/vite.config.ts', '**/dist'],
  },
];
