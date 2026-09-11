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

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  ...compat.extends('../../.eslintrc.hermes.json'),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'jsx-a11y/accessible-emoji': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\$blue(1[0-2]|[1-9])\\b/]',
          message:
            '$blue* Tamagui tokens are banned (generic Tailwind blue). Use a brand token from .agents/skills/ui/references/brand-colors.md instead.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\$blue(1[0-2]|[1-9])\\b/]',
          message:
            '$blue* Tamagui tokens are banned (generic Tailwind blue). Use a brand token from .agents/skills/ui/references/brand-colors.md instead.',
        },
        {
          selector: "JSXAttribute[name.name='theme'] Literal[value='blue']",
          message:
            'theme="blue" is banned (generic Tailwind blue). Use backgroundColor="$brandNavyLight" with hoverStyle/pressStyle instead \u2014 see .agents/skills/ui/references/brand-colors.md.',
        },
        {
          selector: "Property[key.name='theme'] Literal[value='blue']",
          message:
            'theme: "blue" is banned (generic Tailwind blue). Use a brand token from .agents/skills/ui/references/brand-colors.md instead.',
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
      ],
    },
    languageOptions: {
      parserOptions: {
        project: ['apps/app/tsconfig.*?.json'],
      },
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    ignores: [
      '**/jest.config.ts',
      '**/.expo',
      '**/web-build',
      '**/cache',
      '**/dist',
      // Tamagui compiler build cache (LS-8793) — same class of gitignored
      // generated output as apps/web's `.tamagui/`; apps/app also uses
      // Tamagui and can generate it locally. See apps/web/eslint.config.mjs
      // for the full explanation.
      '**/.tamagui/**',
    ],
  },
];
