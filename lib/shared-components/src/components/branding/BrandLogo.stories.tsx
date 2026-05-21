import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { BrandLogo } from './BrandLogo';

const LOGO_SRC = '/logo.png';

// The component uses a discriminated union for runtime type safety. Storybook's
// Meta inference resolves the union args to `never`, so we type the meta with
// the with-mark variant and use `render` for the wordmark-only variant.
type WithMarkArgs = {
  src: string;
  size?: number;
  wordmark?: string;
  tagline?: string | null;
  alt?: string;
};

const meta: Meta<WithMarkArgs> = {
  title: 'Branding/BrandLogo',
  component: BrandLogo,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'night-stadium' },
    docs: {
      description: {
        component:
          'Primary Legacy Sports logo lockup: mark + gold display wordmark + italic tagline. Mirrors `docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/brand-logo.html` in the design bundle.',
      },
    },
  },
  tags: ['autodocs'],
  args: { src: LOGO_SRC },
};

export default meta;
type Story = StoryObj<WithMarkArgs>;

export const Default: Story = {};

export const Compact: Story = {
  args: { size: 36 },
};

export const Large: Story = {
  args: { size: 72 },
};

export const NoTagline: Story = {
  args: { tagline: null },
};

export const WordmarkOnly: StoryObj = {
  render: () => <BrandLogo wordmarkOnly />,
};

export const OnDarkSurface: Story = {
  render: (args: WithMarkArgs) => (
    <YStack backgroundColor="$background" padding="$6" borderRadius="$4">
      <BrandLogo
        src={args.src}
        size={args.size}
        wordmark={args.wordmark}
        tagline={args.tagline}
        alt={args.alt}
      />
    </YStack>
  ),
};
