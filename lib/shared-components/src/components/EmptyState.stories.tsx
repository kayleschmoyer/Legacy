import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import React from 'react';
import { Button, Text } from 'tamagui';
import { EmptyState } from './EmptyState';
import { FONT_DISPLAY } from '../utils/typography';

/** Reusable story action button matching the EmptyState design spec. */
interface StoryButtonProps {
  label: string;
  ghost?: boolean;
}
const StoryButton = ({ label, ghost = false }: StoryButtonProps) => (
  <Button
    size="$3"
    backgroundColor={ghost ? 'transparent' : '$brandNavy'}
    borderColor={ghost ? '$outlineStrong' : '$brandNavyLight'}
    borderWidth={1}
    borderRadius={12}
    paddingHorizontal="$4"
    onPress={fn()}
  >
    <Text
      fontFamily={FONT_DISPLAY}
      fontWeight="700"
      fontSize={13}
      color={ghost ? '$color12' : '$textOnAccent'}
      letterSpacing={0.04 * 13}
    >
      {label}
    </Text>
  </Button>
);

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A centered placeholder shown when a list or section has no data. Supports default, error, and compact variants.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    variant: { control: 'radio', options: ['default', 'error'] },
    compact: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const LeagueIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width={26}
    height={26}
    stroke="currentColor"
    fill="none"
    strokeWidth={1.6}
    role="img"
    aria-label="League icon"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width={26}
    height={26}
    stroke="currentColor"
    fill="none"
    strokeWidth={1.6}
    role="img"
    aria-label="Search icon"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const AlertIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width={26}
    height={26}
    stroke="currentColor"
    fill="none"
    strokeWidth={1.6}
    role="img"
    aria-label="Alert icon"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

export const Default: Story = {
  args: {
    title: 'No standings yet',
  },
};

export const WithDescription: Story = {
  args: {
    title: 'No players found',
    description:
      'Try adjusting your search filters or check back later for updated rosters.',
  },
};

export const WithIcon: Story = {
  args: {
    title: 'No leagues yet',
    description:
      'Create or join your first league. Draft legends from across MLB history.',
    icon: <LeagueIcon />,
  },
};

export const WithAction: Story = {
  args: {
    title: 'No leagues joined',
    description: 'Create or join a league to get started.',
    icon: <LeagueIcon />,
    action: <StoryButton label="Create a League" />,
  },
};

export const SearchEmpty: Story = {
  args: {
    title: 'No players found',
    description: 'Try a different era, position, or team.',
    icon: <SearchIcon />,
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    title: 'Unable to load your leagues',
    description: 'We hit an error talking to the server.',
    icon: <AlertIcon />,
    action: <StoryButton label="Retry" ghost />,
  },
};

export const Compact: Story = {
  args: {
    compact: true,
    title: 'No activity yet',
    description: 'Once your draft starts, picks will appear here.',
  },
};
