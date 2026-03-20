import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { LoginPage } from './LoginPage';
import type { OAuthConfig } from '../../platform-components/types';

const mockConfig: OAuthConfig = {
  googleClientId: 'mock-client-id.apps.googleusercontent.com',
  oauthProxyUrl: 'https://mock-oauth-proxy.example.com',
};

const meta: Meta<typeof LoginPage> = {
  title: 'Features/Auth/LoginPage',
  component: LoginPage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full OAuth login page with Google sign-in, responsive wide/mobile layouts, loading and error states, and background decorations.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onSuccess: { action: 'login-success' },
    onError: { action: 'login-error' },
    useWideLayout: { control: 'boolean' },
    hideDecorations: { control: 'boolean' },
    appName: { control: 'text' },
    maxWidth: { control: { type: 'number', min: 300, max: 800, step: 50 } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    config: mockConfig,
    onSuccess: fn(),
    onError: fn(),
  },
};

export const WideLayout: Story = {
  args: {
    config: mockConfig,
    onSuccess: fn(),
    onError: fn(),
    useWideLayout: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Desktop-optimized wide layout with horizontal split between branding and login form.',
      },
    },
  },
};

export const MobileLayout: Story = {
  args: {
    config: mockConfig,
    onSuccess: fn(),
    onError: fn(),
    useWideLayout: false,
    maxWidth: 400,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    docs: {
      description: {
        story:
          'Mobile-optimized vertical layout with stacked branding and login.',
      },
    },
  },
};

export const NoDecorations: Story = {
  args: {
    config: mockConfig,
    onSuccess: fn(),
    onError: fn(),
    hideDecorations: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Clean embedded variant without background circle decorations -- suitable for embedding in other pages.',
      },
    },
  },
};

export const CustomBranding: Story = {
  args: {
    config: mockConfig,
    onSuccess: fn(),
    onError: fn(),
    appName: 'Fantasy Baseball Pro',
    maxWidth: 500,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Custom app name and card width to demonstrate branding flexibility.',
      },
    },
  },
};

export const WithCustomLogo: Story = {
  args: {
    config: mockConfig,
    onSuccess: fn(),
    onError: fn(),
    appName: 'Legacy Sports',
    logo: (
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 32,
          fontWeight: 'bold',
        }}
      >
        LS
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: 'Custom logo element replacing the default circle initial.',
      },
    },
  },
};
