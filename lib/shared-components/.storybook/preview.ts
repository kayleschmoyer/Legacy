import * as React from 'react';
import type { Preview } from '@storybook/react';
import type { Decorator } from '@storybook/react';
import { TamaguiProvider, Theme } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

const withTamagui: Decorator = (Story) => {
  return React.createElement(
    TamaguiProvider,
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config: tamaguiConfig as any,
      defaultTheme: 'dark',
    },
    React.createElement(Theme, { name: 'dark' }, React.createElement(Story)),
  );
};

const preview: Preview = {
  decorators: [withTamagui],
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      description: {
        component:
          'Component documentation for Legacy Sports shared components',
      },
    },
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: {
            width: '375px',
            height: '667px',
          },
        },
        tablet: {
          name: 'Tablet',
          styles: {
            width: '768px',
            height: '1024px',
          },
        },
        desktop: {
          name: 'Desktop',
          styles: {
            width: '1024px',
            height: '768px',
          },
        },
      },
    },
  },
};

export default preview;
