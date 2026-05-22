import type { Meta, StoryObj } from '@storybook/react';
import { Text, XStack, YStack } from 'tamagui';
import { AvatarImage } from './AvatarImage';

const meta: Meta<typeof AvatarImage> = {
  title: 'Components/AvatarImage',
  component: AvatarImage,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Displays a user or team avatar. Shows the image URL when provided; falls back to a brand-gradient circle with up-to-two derived initials, or a neutral empty glyph when no identity is known. Supports `xs`/`sm`/`md`/`lg`/`xl` token sizes (plus arbitrary pixel diameters for legacy call sites) and decorative `gold`/`seam`/`success` rings.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    ring: { control: 'select', options: ['none', 'gold', 'seam', 'success'] },
    url: { control: 'text' },
    username: { control: 'text' },
    borderRadius: { control: { type: 'number', min: 0, max: 64 } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const Caption = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize={11} color="$textMuted">
    {children}
  </Text>
);

export const WithInitials: Story = {
  args: { username: 'Brad Krupa', size: 'md' },
};

export const WithImage: Story = {
  args: {
    url: 'https://placehold.co/96x96/1B3A5C/C5A55A?text=BK',
    username: 'Brad Krupa',
    size: 'md',
  },
};

export const Empty: Story = {
  args: { size: 'md' },
};

export const Sizes: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
        <YStack key={s} alignItems="center" gap="$1">
          <AvatarImage username="Rickey Johnson" size={s} />
          <Caption>{`${s} · ${{ xs: 24, sm: 32, md: 44, lg: 64, xl: 88 }[s]}`}</Caption>
        </YStack>
      ))}
    </XStack>
  ),
};

export const Rings: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      {(['none', 'gold', 'seam', 'success'] as const).map((r) => (
        <YStack key={r} alignItems="center" gap="$1">
          <AvatarImage username="Jane Doe" size="lg" ring={r} />
          <Caption>{r}</Caption>
        </YStack>
      ))}
    </XStack>
  ),
};

export const FallbackStates: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <YStack alignItems="center" gap="$1">
        <AvatarImage size="md" />
        <Caption>empty</Caption>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <AvatarImage username="Rickey Johnson" size="md" />
        <Caption>initials</Caption>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <AvatarImage
          url="https://placehold.co/64x64/1B3A5C/C5A55A?text=RJ"
          username="Rickey Johnson"
          size="md"
        />
        <Caption>image</Caption>
      </YStack>
    </XStack>
  ),
};

export const MultipleUsers: Story = {
  render: () => (
    <XStack gap="$2" alignItems="center">
      <AvatarImage username="Alice Andrews" size="md" />
      <AvatarImage username="Bob Bryant" size="md" />
      <AvatarImage username="Charlie Chen" size="md" />
      <AvatarImage username="Diana" size="md" />
      <AvatarImage username="Eve Edwards" size="md" />
    </XStack>
  ),
};

export const SquareBorderRadius: Story = {
  args: { username: 'Mike Mason', size: 'md', borderRadius: 8 },
};
