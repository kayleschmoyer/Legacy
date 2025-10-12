/**
 * React ESLint Configuration
 * 
 * Configuration for React applications and components (both web and React Native).
 * Extends the base configuration with React-specific rules.
 */

module.exports = {
  root: false,
  extends: [
    './base',
    'plugin:@nx/react',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended'
  ],
  plugins: [
    'react',
    'react-hooks',
    'jsx-a11y'
  ],
  settings: {
    react: {
      version: 'detect'
    }
  },
  overrides: [
    // React component files
    {
      files: ['*.tsx', '*.jsx'],
      rules: {
        // React component formatting
        'react/self-closing-comp': [
          'error',
          {
            component: true,
            html: true
          }
        ],
        
        // Prevent missing React import (not needed in React 17+)
        'react/react-in-jsx-scope': 'off',
        'react/jsx-uses-react': 'off',
        
        // JSX formatting and best practices
        'react/jsx-curly-brace-presence': [
          'error',
          {
            props: 'never',
            children: 'never'
          }
        ],
        'react/jsx-boolean-value': ['error', 'never'],
        'react/jsx-sort-props': [
          'error',
          {
            callbacksLast: true,
            shorthandFirst: true,
            ignoreCase: true
          }
        ],
        
        // Hook usage
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        
        // Accessibility
        'jsx-a11y/anchor-is-valid': 'warn',
        'jsx-a11y/alt-text': 'error',
        
        // React Native specific allowances
        'jsx-a11y/no-noninteractive-element-interactions': [
          'error',
          {
            handlers: ['onClick', 'onMouseDown', 'onMouseUp', 'onKeyPress', 'onKeyDown', 'onKeyUp'],
            // Allow React Native TouchableOpacity patterns
            alert: ['onPress']
          }
        ]
      }
    },
    
    // React component test files
    {
      files: [
        '**/*.test.tsx',
        '**/*.spec.tsx',
        '**/test/**/*.tsx'
      ],
      extends: [
        'plugin:testing-library/react'
      ],
      rules: {
        // More permissive for test files
        'jsx-a11y/anchor-is-valid': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'jsx-a11y/no-noninteractive-element-interactions': 'off'
      }
    },
    
    // Storybook files
    {
      files: ['**/*.stories.tsx', '**/*.story.tsx'],
      rules: {
        // Storybook files often use any for flexible story args
        '@typescript-eslint/no-explicit-any': 'off',
        'react/jsx-sort-props': 'off'
      }
    },
    
    // React Native specific files
    {
      files: [
        '**/app/**/*.tsx',
        '**/app/**/*.ts',
        '**/*.native.tsx',
        '**/*.native.ts'
      ],
      rules: {
        // React Native doesn't need all web accessibility rules
        'jsx-a11y/anchor-is-valid': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'jsx-a11y/no-static-element-interactions': 'off'
      }
    }
  ]
};
