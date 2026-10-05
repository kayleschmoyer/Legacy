import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import baseConfig from '../../eslint.config.mjs';
import nx from '@nx/eslint-plugin';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

const RESTRICTED_SYNTAX = [
  {
    selector: 'Literal[value=/^\\$blue([1-9]|1[0-2])$/]',
    message:
      'Raw Tamagui $blue* tokens are banned (LS-8523) \u2014 render generic Tailwind blue and violate the brand. Use $brandNavy*/$brandGold* tokens instead. See .agents/skills/ui/references/brand-colors.md.',
  },
  {
    selector: "JSXAttribute[name.name='theme'] > Literal[value='blue']",
    message:
      'theme="blue" is banned (LS-8523) \u2014 renders generic Tailwind blue. Use backgroundColor="$brandNavyLight" with hoverStyle/pressStyle instead. See .agents/skills/ui/references/brand-colors.md.',
  },
  {
    selector: "Property[key.name='theme'] > Literal[value='blue']",
    message:
      "theme: 'blue' is banned (LS-8523) \u2014 renders generic Tailwind blue. Use $brandNavy*/$brandGold* tokens instead. See .agents/skills/ui/references/brand-colors.md.",
  },
  {
    selector:
      'JSXAttribute[name.name=/^(letterSpacing|lineHeight)$/] > Literal[raw=/^[\'"](?!\\$)/]',
    message:
      "String letterSpacing/lineHeight (em/px/unit-less strings) hard-crashes native RCTText: ClassCastException String\u2192Double, the app closes with no JS error (LS-8624/LS-8630). Use a number (points = em \u00D7 fontSize), a Tamagui $token, or a `Platform.OS === 'web' ? ('\u2026' as unknown as number) : <number>` branch. See .agents/skills/standards/references/tamagui-native-pitfalls.md.",
  },
  {
    selector:
      'JSXAttribute[name.name=/^(letterSpacing|lineHeight)$/] > JSXExpressionContainer > Literal[raw=/^[\'"](?!\\$)/]',
    message:
      "String letterSpacing/lineHeight (em/px/unit-less strings) hard-crashes native RCTText: ClassCastException String\u2192Double, the app closes with no JS error (LS-8624/LS-8630). Use a number (points = em \u00D7 fontSize), a Tamagui $token, or a `Platform.OS === 'web' ? ('\u2026' as unknown as number) : <number>` branch. See .agents/skills/standards/references/tamagui-native-pitfalls.md.",
  },
  {
    selector:
      'JSXAttribute[name.name=/^(letterSpacing|lineHeight)$/] > JSXExpressionContainer > TemplateLiteral',
    message:
      'Template-literal letterSpacing/lineHeight resolves to a string and hard-crashes native RCTText: ClassCastException String\u2192Double, the app closes with no JS error (LS-8624/LS-8630). Use a number (points = em \u00D7 fontSize). See .agents/skills/standards/references/tamagui-native-pitfalls.md.',
  },
  {
    selector:
      'Property[key.name=/^(letterSpacing|lineHeight)$/] > Literal[raw=/^[\'"](?!\\$)/]',
    message:
      "String letterSpacing/lineHeight (em/px/unit-less strings) hard-crashes native RCTText: ClassCastException String\u2192Double, the app closes with no JS error (LS-8624/LS-8630). Use a number (points = em \u00D7 fontSize), a Tamagui $token, or a `Platform.OS === 'web' ? ('\u2026' as unknown as number) : <number>` branch. See .agents/skills/standards/references/tamagui-native-pitfalls.md.",
  },
  {
    selector:
      'Property[key.name=/^(letterSpacing|lineHeight)$/] > TemplateLiteral',
    message:
      'Template-literal letterSpacing/lineHeight resolves to a string and hard-crashes native RCTText: ClassCastException String\u2192Double, the app closes with no JS error (LS-8624/LS-8630). Use a number (points = em \u00D7 fontSize). See .agents/skills/standards/references/tamagui-native-pitfalls.md.',
  },
];

// React Native defines a global `window` (an alias of `global`) with no DOM
// APIs, so `typeof window === 'undefined'` does not mean "no DOM" in shared
// code: Dialog's useReducedMotion passed that guard on native and called
// `window.matchMedia` -> "undefined is not a function", crashing every
// screen rendering a Dialog (LS-9249). Web-only files are exempt.
const WINDOW_DOM_GUARD = {
  selector:
    "BinaryExpression[left.type='UnaryExpression'][left.operator='typeof'][left.argument.name='window'][right.value='undefined']",
  message:
    "`typeof window` is not a DOM check: React Native defines a global `window` without DOM APIs (LS-9249). Use `typeof document === 'undefined'` for \"no DOM\", or feature-detect the exact API (e.g. `typeof window.matchMedia === 'function'`); web-only code belongs in a `.web.ts(x)` file. See .agents/skills/standards/references/tamagui-native-pitfalls.md.",
};

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  ...compat.extends('../../.eslintrc.hermes.json'),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['lib/shared-components/tsconfig.*?.json'],
      },
    },
  },
  ...compat
    .config({
      env: {
        node: true,
        jest: true,
      },
    })
    .map((config) => ({
      ...config,
      files: ['**/*.js', '**/*.jsx'],
      rules: {
        ...config.rules,
      },
      languageOptions: {
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module',
        },
      },
    })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-use-before-define': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'jsx-a11y/accessible-emoji': 'error',
      'sort-imports': 'error',
      'import/order': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'prefer-const': 'error',
      'no-inner-declarations': 'error',
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.web.ts',
      '**/*.web.tsx',
      '**/*.stories.tsx',
      '**/platform-components/web/**',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX, WINDOW_DOM_GUARD],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.native.tsx'],
    rules: {
      'jsx-a11y/accessible-emoji': 'off',
    },
  },
  {
    files: ['**/codegen.ts', '**/.storybook/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      '**/jest.config.ts',
      '**/jest.config.web.ts',
      '**/jest.config.mobile.ts',
      '**/jest.storybook.config.ts',
      '**/dist',
      '**/jest-setup.js',
      '**/node_modules/**',
      '**/.cache/**',
      '**/storybook-static/**',
      '**/.storybook/**',
      '**/*.example.tsx',
      '**/src/platform-components/wrappers/LazyTable.tsx',
      '**/src/features/players/usePlayerProjections.ts',
    ],
  },
];
