import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { LoginPage } from './LoginPage';

const meta: Meta<typeof LoginPage> = {
  title: 'Features/Auth/LoginPage',
  component: LoginPage,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Shared auth card used by both web and mobile login screens. Accepts callbacks for Google and Discord sign-in and renders the presentational card UI. When onEmailPasswordSignIn is provided (web only), an email + password form renders above the OAuth buttons (LGN-017).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onGoogleSignIn: { action: 'google-sign-in' },
    onEmailPasswordSignIn: { action: 'email-password-sign-in' },
    onDiscordSignIn: { action: 'discord-sign-in' },
    onDismissError: { action: 'dismiss-error' },
    isEmailPasswordLoading: { control: 'boolean' },
    isGoogleLoading: { control: 'boolean' },
    isDiscordLoading: { control: 'boolean' },
    isConfiguring: { control: 'boolean' },
    errorMessage: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onGoogleSignIn: fn(),
  },
};

export const WithDiscord: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Both Google and Discord sign-in options visible.',
      },
    },
  },
};

export const WithEmailPassword: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    onEmailPasswordSignIn: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Email + password form (LGN-017) rendered above the OAuth buttons. The form surfaces the existing /oauth/login endpoint in the UI so human users are not limited to OAuth-only sign-in.',
      },
    },
  },
};

export const EmailPasswordLoading: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    onEmailPasswordSignIn: fn(),
    isEmailPasswordLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Email/password sign-in in progress — the Sign In button shows a spinner and all auth options are disabled.',
      },
    },
  },
};

export const Configuring: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    isConfiguring: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'OAuth provider initialising — the Google button shows a spinner and a "Preparing sign-in…" progress label so the disabled state reads as in-progress rather than broken. All buttons disabled.',
      },
    },
  },
};

export const GoogleLoading: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    isGoogleLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Google sign-in in progress — spinner shown, all buttons disabled.',
      },
    },
  },
};

export const DiscordLoading: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    isDiscordLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Discord sign-in in progress — spinner shown, all buttons disabled.',
      },
    },
  },
};

export const WithError: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    errorMessage: 'Sign-in failed. Please try again.',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Persistent error banner — no dismiss control or auto-dismiss timer because onDismissError is omitted.',
      },
    },
  },
};

export const WithDismissibleError: Story = {
  args: {
    onGoogleSignIn: fn(),
    onDiscordSignIn: fn(),
    errorMessage: 'Sign-in failed. Please try again.',
    onDismissError: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Error banner with a dismiss (×) control. Passing onDismissError also enables an auto-dismiss timer that clears the banner after a few seconds.',
      },
    },
  },
};
