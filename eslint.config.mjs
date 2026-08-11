import { dirname } from 'path';
import { fileURLToPath } from 'url';
import nx from '@nx/eslint-plugin';
import importPlugin from 'eslint-plugin-import';

const repoRoot = dirname(fileURLToPath(import.meta.url));
// `nx.configs['flat/typescript']` (below) already registers the
// `@typescript-eslint` plugin via the `typescript-eslint` meta-package.
// Adding type-checked rules through `FlatCompat`'s `plugin:@typescript-eslint/...`
// resolution would `require('@typescript-eslint/eslint-plugin')` directly,
// producing a second, distinct plugin object under the same `@typescript-eslint`
// key — ESLint 9 flat config rejects that as "Cannot redefine plugin". Using
// `typescript-eslint`'s own `recommendedTypeChecked` config here keeps both
// on the identical plugin instance.
import tseslint from 'typescript-eslint';

export default [
  ...nx.configs['flat/base'],
  {
    files: ['**/*.tsx', '**/*.jsx'],
    rules: {
      'react/self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          // tools/vite-configs is a plain relative-import helper folder (no
          // project.json), consumed by relative path from every consumer's
          // vite.config.ts so Vite's own config loader — which runs before
          // any Nx/tsconfig-paths resolution is available — can load it with
          // bare Node ESM resolution. See tools/mcp/rollbar-server/vite.config.ts.
          allow: ['../../vite-configs'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  ...nx.configs['flat/typescript'],
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      ...config.plugins,
      import: importPlugin,
    },
    rules: {
      ...config.rules,
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'sort-keys': 'off',
      'sort-imports': [
        'error',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
      'import/order': [
        1,
        {
          groups: [
            'external',
            'builtin',
            'internal',
            'sibling',
            'parent',
            'index',
          ],
        },
      ],
    },
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        project: ['./tsconfig.base.json'],
      },
    },
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@apollo/client',
              importNames: ['gql'],
              message:
                'Do not use inline gql tags. Define queries in .graphql files and import generated hooks from graphql.generated.ts.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TaggedTemplateExpression[tag.name='gql']",
          message:
            'Do not use inline gql`` template tags. Define queries in .graphql files and run codegen to generate typed hooks.',
        },
      ],
    },
    ignores: ['**/graphql.generated.ts'],
  },
  {
    // LS-8614: flag *.spec.ts files with no import/export (i.e. files that
    // aren't actually a module — usually a sign the file's tests got
    // deleted/moved but the file itself was left behind).
    files: ['**/*.spec.ts'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/unambiguous': 'error',
    },
  },
  {
    // Pinned to the repo root explicitly: this object's `ignores` are
    // authored relative to the repo root, but when this config is spread
    // into a project's own eslint.config.mjs and that project is linted via
    // Nx's *inferred* eslint target (cwd=projectRoot, auto-discovered
    // config — as opposed to the explicit @nx/eslint:lint executor, which
    // chdir's to the workspace root), ESLint's default basePath becomes the
    // project directory instead of the repo root, silently breaking these
    // repo-root-relative patterns. See LS-8615.
    basePath: repoRoot,
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^VITE_/]",
          message:
            "Direct process.env.VITE_* reads are forbidden outside lib/app-config (LS-7561). Use config from '@legacy-sports/app-config' instead.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.value=/^VITE_/]",
          message:
            "Direct process.env.VITE_* reads are forbidden outside lib/app-config (LS-7561). Use config from '@legacy-sports/app-config' instead.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_/]",
          message:
            "Direct process.env.EXPO_PUBLIC_* reads are forbidden outside lib/app-config (LS-7561). Use config from '@legacy-sports/app-config' instead.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.value=/^EXPO_PUBLIC_/]",
          message:
            "Direct process.env.EXPO_PUBLIC_* reads are forbidden outside lib/app-config (LS-7561). Use config from '@legacy-sports/app-config' instead.",
        },
        {
          selector:
            "MemberExpression[object.object.type='MetaProperty'][object.property.name='env'][property.name=/^VITE_/]",
          message:
            "Direct import.meta.env.VITE_* reads are forbidden outside lib/app-config (LS-7561). Use config from '@legacy-sports/app-config' instead.",
        },
        {
          selector:
            "MemberExpression[object.object.type='MetaProperty'][object.property.name='env'][property.value=/^VITE_/]",
          message:
            "Direct import.meta.env.VITE_* reads are forbidden outside lib/app-config (LS-7561). Use config from '@legacy-sports/app-config' instead.",
        },
      ],
    },
    ignores: [
      'lib/app-config/src/**',
      'lib/app-config/plugins/**',
      'tools/vite-configs/**',
      '**/app.config.js',
    ],
  },
  ...nx.configs['flat/javascript'],
  {
    ignores: ['dist', '**/node_modules/**'],
  },
  {
    ignores: [
      'node_modules/',
      '.modules-pool/',
      'dist/',
      'webpack.config.*',
      '**/.tamagui/**',
    ],
  },
  {
    // Pinned to the repo root — see the basePath comment on the VITE_*
    // restriction block above for why.
    //
    // None of these directories had their own .eslintrc.json before this
    // migration, so under the legacy setup they were silently excluded by
    // root's `ignorePatterns: ["**/*"]` blanket ignore (root:true, with no
    // per-project "!**/*" un-ignore to opt back in — the standard Nx
    // pattern). Flat config correctly drops that blanket ignore, which
    // would otherwise newly enforce lint on years of previously-unlinted
    // tooling in the same PR as the ESLint 9 migration. Preserving the
    // pre-migration scope here for remaining projects; LS-8747 tracks a
    // dedicated cleanup pass. tools/mcp/nx-server has been removed from
    // this ignore list and its lint violations fixed (LS-8737).
    basePath: repoRoot,
    ignores: [
      'tools/mcp/aws-server/**',
      'tools/mcp/db-admin-server/**',
      'tools/mcp/dev-process-server/**',
      'tools/mcp/github-server/**',
      'tools/mcp/rollbar-server/**',
    ],
  },
];
