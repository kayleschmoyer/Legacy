import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../src/Welcome.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/Layout.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/XStack.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/YStack.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/Typography.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/components/Button.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/components/LoadingPanel.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/Dropdown.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/ConditionalProviders.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/features/draft/PlayerCard.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/features/draft/FilterComponents.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/features/stats/StatsTable.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/features/teams/TeamPicker.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/features/players/PlayerRow.stories.@(js|jsx|ts|tsx|mdx)',
    '../src/navigation/index.stories.@(js|jsx|ts|tsx|mdx)',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-docs',
    '@storybook/addon-controls',
    '@storybook/addon-a11y',
    '@storybook/addon-viewport',
    '@storybook/addon-coverage', // For code coverage during testing
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  features: {
    // Remove deprecated storyStoreV7 option
  },
  docs: {
    autodocs: 'tag',
  },
  typescript: {
    check: false,
    reactDocgen: false, // Disable react-docgen to avoid type parsing issues
  },
  async viteFinal(config) {
    // Resolve React Native imports to React Native Web for Storybook
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        'react-native$': 'react-native-web',
        'react-native/(.*)$': 'react-native-web/dist/$1',
      },
    };

    // Configure optimizeDeps to handle JSX properly and exclude problematic packages
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: ['react-native-web'],
      exclude: ['react-native'],
      esbuildOptions: {
        ...config.optimizeDeps?.esbuildOptions,
        loader: {
          '.js': 'jsx',
        },
      },
    };

    config.define = {
      ...config.define,
      global: 'globalThis',
      __DEV__: JSON.stringify(true),
    };

    return config;
  },
};

export default config;
