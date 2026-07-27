import baseConfig from '../../eslint.config.mjs';
import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.*?.json'],
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'jsx-a11y/accessible-emoji': 'error',
    },
  },
  {
    files: ['**/e2e/**/*.ts', '**/e2e/**/*.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/codegen.ts', '**/src/plugins/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\$blue([1-9]|1[0-2])$/]',
          message:
            'Raw Tamagui $blue* tokens render generic Tailwind blue and are banned. Use the brand token replacement table in .agents/skills/ui/references/brand-colors.md ($brandNavyLight, $brandGoldLight, \u2026).',
        },
        {
          selector: "JSXAttribute[name.name='theme'] Literal[value='blue']",
          message:
            'theme="blue" renders generic Tailwind blue and is banned. Use backgroundColor="$brandNavyLight" + hoverStyle/pressStyle instead \u2014 see .agents/skills/ui/references/brand-colors.md.',
        },
      ],
    },
  },
  {
    ignores: [
      '**/jest.config.ts',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/src/__mocks__/**/*.js',
      '**/test-setup.ts',
      '**/public/**',
    ],
  },
];
